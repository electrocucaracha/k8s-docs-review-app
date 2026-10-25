#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod llm;
mod published_references;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use wait_timeout::ChildExt;
use walkdir::WalkDir;

#[derive(Default)]
struct Repository(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
struct Document {
    path: String,
    content: String,
}

#[derive(Serialize)]
struct Workspace {
    name: String,
    documents: Vec<Document>,
    paths: Vec<String>,
    complete: bool,
}

#[derive(Clone, Deserialize, Serialize)]
struct PullRequest {
    number: u32,
    title: String,
    url: String,
    sha: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReviewContext {
    pull_request: PullRequest,
    review_paths: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestWorkspace {
    #[serde(flatten)]
    workspace: Workspace,
    #[serde(flatten)]
    context: ReviewContext,
    local_changes: bool,
}

fn git(root: &Path, arguments: &[&str]) -> Result<String, String> {
    let hooks = tempfile::tempdir().map_err(|error| error.to_string())?;
    let mut child = Command::new("git")
        .args(["-c", &format!("core.hooksPath={}", hooks.path().display()), "-c", "core.autocrlf=false"])
        .args(arguments)
        .current_dir(root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LFS_SKIP_SMUDGE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start Git. Install Git and ensure it is on PATH. {error}"))?;
    if child.wait_timeout(Duration::from_secs(300)).map_err(|error| error.to_string())?.is_none() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Git timed out after five minutes. Check your connection and retry.".into());
    }
    let output = child.wait_with_output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(format!("Git failed: {}", String::from_utf8_lossy(&output.stderr).chars().take(2000).collect::<String>()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn translation_locale(path: &str) -> Option<&str> {
    let (locale, _) = path.strip_prefix("content/")?.split_once('/')?;
    let mut parts = locale.split('-');
    let primary = parts.next()?;
    if locale == "en" || !(2..=3).contains(&primary.len()) || !primary.bytes().all(|byte| byte.is_ascii_lowercase()) {
        return None;
    }
    if let Some(region) = parts.next() {
        if !(2..=4).contains(&region.len()) || !region.bytes().all(|byte| byte.is_ascii_lowercase()) {
            return None;
        }
    }
    if parts.next().is_some() { return None; }
    Some(locale)
}

fn validate_context(context: &ReviewContext) -> Result<(), String> {
    if context.pull_request.number == 0 || context.pull_request.number > 2147483647
        || context.pull_request.sha.len() != 40 || !context.pull_request.sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid PR number or revision.".into());
    }
    if context.review_paths.is_empty() || context.review_paths.len() > 3000 || context.review_paths.iter().any(|path| {
        translation_locale(path).is_none() || translation_locale(path) != context.review_paths.first().and_then(|first| translation_locale(first))
            || !path.ends_with(".md") || path.contains('\\')
            || !Path::new(path).components().all(|part| matches!(part, Component::Normal(_)))
    }) { return Err("Invalid translation PR file list.".into()); }
    Ok(())
}

fn prepare_checkout(root: &Path, context: &ReviewContext, preserve_changes: bool) -> Result<bool, String> {
    if preserve_changes && !git(root, &["status", "--porcelain", "--untracked-files=normal"])?.is_empty() { return Ok(true); }
    let reference = format!("+refs/pull/{}/head:refs/review/pr", context.pull_request.number);
    git(root, &["fetch", "--quiet", "--no-tags", "--depth=1", "origin", &reference])?;
    if git(root, &["rev-parse", "refs/review/pr"])? != context.pull_request.sha {
        return Err("The PR changed while loading. Load it again to review the latest revision.".into());
    }
    let locale = context.review_paths.first().and_then(|path| translation_locale(path)).ok_or("Invalid translation locale.")?;
    let content = format!("content/{locale}");
    git(root, &["sparse-checkout", "set", "--cone", "content/en", &content, "static"])?;
    git(root, &["checkout", "--quiet", "--detach", "refs/review/pr", "--"])?;
    Ok(false)
}

fn checkout_pull_request(cache: &Path, mut context: ReviewContext) -> Result<(PathBuf, PullRequestWorkspace), String> {
    validate_context(&context)?;
    let remote = "https://github.com/kubernetes/website.git";
    fs::create_dir_all(cache).map_err(|error| error.to_string())?;
    let cache = cache.canonicalize().map_err(|error| error.to_string())?;
    let root = cache.join(format!("pr-{}", context.pull_request.number));
    let local_changes;
    if root.exists() {
        if root.symlink_metadata().map_err(|error| error.to_string())?.file_type().is_symlink()
            || !root.join(".git").is_dir() { return Err("The cached checkout is not a regular Git repository.".into()); }
        if git(&root, &["remote", "get-url", "origin"])? != remote { return Err("The cached checkout has an unexpected remote.".into()); }
        local_changes = prepare_checkout(&root, &context, true)?;
        if local_changes {
            context = serde_json::from_str(&fs::read_to_string(root.join(".git/review-context.json")).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
            validate_context(&context)?;
            if git(&root, &["rev-parse", "HEAD"])? != context.pull_request.sha { return Err("The cached checkout revision changed outside the app.".into()); }
        }
    } else {
        let temporary = tempfile::tempdir_in(&cache).map_err(|error| error.to_string())?;
        git(temporary.path(), &["clone", "--quiet", "--filter=blob:none", "--depth=1", "--no-checkout", "--single-branch", "--no-tags", "--", remote, "checkout"])?;
        let checkout = temporary.path().join("checkout");
        prepare_checkout(&checkout, &context, false)?;
        fs::rename(checkout, &root).map_err(|error| error.to_string())?;
        local_changes = false;
    }
    let locale = translation_locale(&context.review_paths[0]).ok_or("Invalid translation locale.")?;
    let mut workspace = read_repository(&root, locale)?;
    if context.review_paths.iter().any(|path| !workspace.documents.iter().any(|document| &document.path == path)) {
        return Err("A changed translation file is missing from the checkout. Local files were not overwritten.".into());
    }
    context.pull_request.url = format!("https://github.com/kubernetes/website/pull/{}", context.pull_request.number);
    workspace.name = format!("website · PR #{}", context.pull_request.number);
    let serialized = serde_json::to_vec(&context).map_err(|error| error.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(root.join(".git")).map_err(|error| error.to_string())?;
    temporary.write_all(&serialized).map_err(|error| error.to_string())?;
    temporary.persist(root.join(".git/review-context.json")).map_err(|error| error.to_string())?;
    Ok((root, PullRequestWorkspace { workspace, context, local_changes }))
}

fn read_repository(root: &Path, locale: &str) -> Result<Workspace, String> {
    let translation_prefix = format!("content/{locale}/");
    if !root.join("content/en").is_dir() || !root.join(format!("content/{locale}")).is_dir() {
        return Err(format!("The website repository must contain content/en/ and content/{locale}/."));
    }
    let mut documents = Vec::new();
    let mut paths = Vec::new();
    let mut total_bytes = 0u64;
    for directory in ["content", "static"] {
        let start = root.join(directory);
        if !start.exists() {
            continue;
        }
        for entry in WalkDir::new(start)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        {
            let entry = entry.map_err(|error| error.to_string())?;
            if !entry.file_type().is_file() {
                continue;
            }
            let canonical = entry
                .path()
                .canonicalize()
                .map_err(|error| error.to_string())?;
            if !canonical.starts_with(root) {
                return Err("A repository path escapes the selected folder.".into());
            }
            let relative = entry
                .path()
                .strip_prefix(root)
                .map_err(|error| error.to_string())?;
            let path = relative.to_string_lossy().replace('\\', "/");
            paths.push(path.clone());
            if paths.len() > 50_000 {
                return Err("This repository exceeds the 50,000-file limit.".into());
            }
            if !(path.starts_with("content/en/") || path.starts_with(&translation_prefix))
                || !path.ends_with(".md")
            {
                continue;
            }
            let bytes = entry.metadata().map_err(|error| error.to_string())?.len();
            total_bytes += bytes;
            if bytes > 4 * 1024 * 1024 || total_bytes > 100 * 1024 * 1024 {
                return Err("Markdown exceeds the 4 MB per-file or 100 MB workspace limit.".into());
            }
            documents.push(Document {
                path,
                content: fs::read_to_string(canonical).map_err(|error| error.to_string())?,
            });
        }
    }
    if !documents
        .iter()
        .any(|document| document.path.starts_with(&translation_prefix))
    {
        return Err("No translation Markdown files found.".into());
    }
    documents.sort_by(|first, second| first.path.cmp(&second.path));
    Ok(Workspace {
        name: root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        documents,
        paths,
        complete: true,
    })
}

#[tauri::command]
async fn load_pull_request(
    app: AppHandle,
    state: State<'_, Repository>,
    pull_request: PullRequest,
    review_paths: Vec<String>,
) -> Result<PullRequestWorkspace, String> {
    let cache = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("checkouts");
    let (root, workspace) = tauri::async_runtime::spawn_blocking(move || checkout_pull_request(&cache, ReviewContext { pull_request, review_paths }))
        .await.map_err(|error| error.to_string())??;
    *state.0.lock().map_err(|error| error.to_string())? = Some(root);
    Ok(workspace)
}

fn write_translation(root: &Path, path: &str, content: &str, original: &str) -> Result<(), String> {
    if content.len() > 4 * 1024 * 1024 {
        return Err("Translation exceeds the 4 MB limit.".into());
    }
    let relative = Path::new(path);
    let locale = translation_locale(path).ok_or("Only translation Markdown files can be saved.")?;
    if path.contains('\\')
        || !path.ends_with(".md")
        || !relative
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err(
            "Only existing translation Markdown files inside the selected repository can be saved."
                .into(),
        );
    }
    let spanish_root = root
        .join(format!("content/{locale}"))
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !spanish_root.starts_with(root) {
        return Err("Translation content escapes the selected repository.".into());
    }
    let target = root
        .join(relative)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !target.starts_with(&spanish_root) {
        return Err("The target escapes the translation content directory.".into());
    }
    if fs::read_to_string(&target).map_err(|error| error.to_string())? != original {
        return Err(
            "This file changed outside the app. Export your draft before reopening the repository."
                .into(),
        );
    }
    let mut temporary =
        tempfile::NamedTempFile::new_in(target.parent().ok_or("Invalid target directory")?)
            .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .set_permissions(
            fs::metadata(&target)
                .map_err(|error| error.to_string())?
                .permissions(),
        )
        .map_err(|error| error.to_string())?;
    temporary
        .write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(&target)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_translation(
    state: State<'_, Repository>,
    path: String,
    content: String,
    original: String,
) -> Result<(), String> {
    let root = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or("Open a repository first.")?;
    tauri::async_runtime::spawn_blocking(move || {
        write_translation(&root, &path, &content, &original)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn open_pull_request(app: AppHandle, number: u32) -> Result<(), String> {
    if number == 0 || number > 2147483647 {
        return Err("Invalid PR number.".into());
    }
    app.opener()
        .open_url(format!("https://github.com/kubernetes/website/pull/{number}"), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn export_markdown(app: AppHandle, name: String, content: String) -> Result<(), String> {
    if content.len() > 8 * 1024 * 1024 {
        return Err("Export exceeds the 8 MB limit.".into());
    }
    if !name.ends_with(".md") || name.contains(['/', '\\']) {
        return Err("Invalid export filename.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("Export Markdown")
            .set_file_name(&name)
            .add_filter("Markdown", &["md"])
            .blocking_save_file();
        let selected = selected
            .ok_or("Export cancelled.")?
            .into_path()
            .map_err(|error| error.to_string())?;
        let mut temporary =
            tempfile::NamedTempFile::new_in(selected.parent().ok_or("Invalid export directory")?)
                .map_err(|error| error.to_string())?;
        temporary
            .write_all(content.as_bytes())
            .map_err(|error| error.to_string())?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|error| error.to_string())?;
        temporary
            .persist(selected)
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(llm::LlmTransport::new()?);
            Ok(())
        })
        .manage(Repository::default())
        .invoke_handler(tauri::generate_handler![
            load_pull_request,
            open_pull_request,
            save_translation,
            export_markdown,
            llm::llm_fetch,
            llm::llm_environment,
            published_references::check_published_reference,
            published_references::open_issue_draft
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run Kubernetes Docs Review");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(sha: String) -> ReviewContext {
        ReviewContext {
            pull_request: PullRequest { number: 42, title: "Spanish update".into(), url: String::new(), sha },
            review_paths: vec!["content/es/docs/page.md".into()],
        }
    }

    #[test]
    fn checks_out_refreshes_and_preserves_cached_edits() {
        let (_temporary, remote) = repository();
        git(&remote, &["init", "--quiet"]).unwrap();
        git(&remote, &["config", "user.name", "Review Test"]).unwrap();
        git(&remote, &["config", "user.email", "review@example.invalid"]).unwrap();
        git(&remote, &["add", "."]).unwrap();
        git(&remote, &["commit", "--quiet", "-m", "Initial documents"]).unwrap();
        git(&remote, &["update-ref", "refs/pull/42/head", "HEAD"]).unwrap();
        let mut review_context = context(git(&remote, &["rev-parse", "HEAD"]).unwrap());
        let cache = tempfile::tempdir().unwrap();
        git(cache.path(), &["clone", "--quiet", "--no-checkout", "--", remote.to_str().unwrap(), "checkout"]).unwrap();
        let checkout = cache.path().join("checkout");
        assert!(!prepare_checkout(&checkout, &review_context, false).unwrap());
        assert_eq!(fs::read_to_string(checkout.join("content/es/docs/page.md")).unwrap(), "# Traduccion");

        fs::write(remote.join("content/es/docs/page.md"), "# Updated remote").unwrap();
        git(&remote, &["add", "."]).unwrap();
        git(&remote, &["commit", "--quiet", "-m", "Update translation"]).unwrap();
        git(&remote, &["update-ref", "refs/pull/42/head", "HEAD"]).unwrap();
        review_context.pull_request.sha = git(&remote, &["rev-parse", "HEAD"]).unwrap();
        assert!(!prepare_checkout(&checkout, &review_context, true).unwrap());
        assert_eq!(fs::read_to_string(checkout.join("content/es/docs/page.md")).unwrap(), "# Updated remote");

        fs::write(checkout.join("content/es/docs/page.md"), "# My local edit").unwrap();
        assert!(prepare_checkout(&checkout, &review_context, true).unwrap());
        assert_eq!(fs::read_to_string(checkout.join("content/es/docs/page.md")).unwrap(), "# My local edit");
    }

    #[test]
    fn refuses_changed_pr_revision_and_invalid_paths() {
        let mut review_context = context("a".repeat(40));
        assert!(validate_context(&review_context).is_ok());
        review_context.review_paths = vec!["content/es/../../outside.md".into()];
        assert!(validate_context(&review_context).is_err());
        review_context.review_paths = vec!["content/es/docs/page.md".into()];
        review_context.pull_request.sha = "--upload-pack=malicious".into();
        assert!(validate_context(&review_context).is_err());
    }

    fn repository() -> (tempfile::TempDir, PathBuf) {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().canonicalize().unwrap();
        fs::create_dir_all(root.join("content/en/docs")).unwrap();
        fs::create_dir_all(root.join("content/es/docs")).unwrap();
        fs::create_dir_all(root.join("static/images")).unwrap();
        fs::write(root.join("content/en/docs/page.md"), "# Source").unwrap();
        fs::write(root.join("content/es/docs/page.md"), "# Traduccion").unwrap();
        fs::write(root.join("static/images/example.png"), [0u8]).unwrap();
        (temporary, root)
    }

    #[test]
    fn indexes_document_pairs_and_static_paths() {
        let (_temporary, root) = repository();
        let workspace = read_repository(&root, "es").unwrap();
        assert_eq!(workspace.documents.len(), 2);
        assert!(workspace
            .paths
            .contains(&"static/images/example.png".to_string()));
    }

    #[test]
    fn saves_spanish_without_modifying_english() {
        let (_temporary, root) = repository();
        write_translation(
            &root,
            "content/es/docs/page.md",
            "# Actualizado",
            "# Traduccion",
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(root.join("content/es/docs/page.md")).unwrap(),
            "# Actualizado"
        );
        assert_eq!(
            fs::read_to_string(root.join("content/en/docs/page.md")).unwrap(),
            "# Source"
        );
    }

    #[test]
    fn loads_and_saves_another_translation_language() {
        let (_temporary, root) = repository();
        fs::create_dir_all(root.join("content/fr/docs")).unwrap();
        fs::write(root.join("content/fr/docs/page.md"), "# Bonjour").unwrap();
        let mut review_context = context("a".repeat(40));
        review_context.review_paths = vec!["content/fr/docs/page.md".into()];
        assert!(validate_context(&review_context).is_ok());
        let workspace = read_repository(&root, "fr").unwrap();
        assert_eq!(workspace.documents.len(), 2);
        assert!(workspace.documents.iter().any(|document| document.path == "content/fr/docs/page.md"));
        write_translation(&root, "content/fr/docs/page.md", "# Salut", "# Bonjour").unwrap();
        assert_eq!(fs::read_to_string(root.join("content/fr/docs/page.md")).unwrap(), "# Salut");
        assert_eq!(fs::read_to_string(root.join("content/en/docs/page.md")).unwrap(), "# Source");
        review_context.review_paths.push("content/es/docs/page.md".into());
        assert!(validate_context(&review_context).is_err());
    }

    #[test]
    fn refuses_to_overwrite_external_changes() {
        let (_temporary, root) = repository();
        assert!(write_translation(&root, "content/es/docs/page.md", "# Draft", "# Stale").is_err());
        assert_eq!(
            fs::read_to_string(root.join("content/es/docs/page.md")).unwrap(),
            "# Traduccion"
        );
    }

    #[test]
    fn rejects_english_and_directory_traversal() {
        let (_temporary, root) = repository();
        for path in [
            "content/en/docs/page.md",
            "content/es/../en/docs/page.md",
            "/tmp/page.md",
        ] {
            assert!(write_translation(&root, path, "# Draft", "# Source").is_err());
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_outside_the_repository() {
        let (_temporary, root) = repository();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("outside.md");
        fs::write(&target, "# Outside").unwrap();
        std::os::unix::fs::symlink(&target, root.join("content/es/docs/escape.md")).unwrap();
        assert!(
            write_translation(&root, "content/es/docs/escape.md", "# Draft", "# Outside").is_err()
        );
        assert_eq!(fs::read_to_string(target).unwrap(), "# Outside");
    }
}
