use crate::{git, translation_locale, Repository};
use reqwest::Url;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use wait_timeout::ChildExt;

static RUNNING: AtomicBool = AtomicBool::new(false);
const SITE: &str = "https://kubernetes.io";
const SITE_DIRECTORIES: [&str; 5] = ["layouts", "assets", "data", "i18n", "archetypes"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HugoLink {
    href: String,
    text: String,
    status: &'static str,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HugoPage {
    path: String,
    route: String,
    rendered: bool,
    links: Vec<HugoLink>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HugoDiagnostic {
    level: &'static str,
    path: Option<String>,
    line: Option<u32>,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HugoReport {
    version: String,
    expected_version: Option<String>,
    success: bool,
    pages: Vec<HugoPage>,
    diagnostics: Vec<HugoDiagnostic>,
}

fn run(
    program: &str,
    arguments: &[&str],
    root: &Path,
    minutes: u64,
) -> Result<(bool, String), String> {
    let output = tempfile::tempfile().map_err(|error| error.to_string())?;
    let mut child = Command::new(program)
        .args(arguments)
        .current_dir(root)
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(output.try_clone().map_err(|error| error.to_string())?)
        .stderr(output.try_clone().map_err(|error| error.to_string())?)
        .spawn()
        .map_err(|error| {
            format!("Could not start {program}. Install it and ensure it is on PATH. {error}")
        })?;
    let status = match child
        .wait_timeout(Duration::from_secs(minutes * 60))
        .map_err(|error| error.to_string())?
    {
        Some(status) => status,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{program} timed out after {minutes} minutes."));
        }
    };
    let mut text = String::new();
    let mut output = output;
    std::io::Seek::rewind(&mut output).map_err(|error| error.to_string())?;
    output
        .take(4 * 1024 * 1024)
        .read_to_string(&mut text)
        .map_err(|error| error.to_string())?;
    Ok((status.success(), text))
}

fn validate_paths(paths: &[String]) -> Result<Vec<String>, String> {
    if paths.is_empty() || paths.len() > 2 {
        return Err("Select an English and translated document pair.".into());
    }
    let mut languages = vec!["en".to_owned()];
    for path in paths {
        let valid = path.starts_with("content/")
            && path.ends_with(".md")
            && !path.contains('\\')
            && Path::new(path)
                .components()
                .all(|part| matches!(part, Component::Normal(_)));
        if !valid {
            return Err("Invalid document path.".into());
        }
        if let Some(locale) = translation_locale(path) {
            if !languages.iter().any(|language| language == locale) {
                languages.push(locale.to_owned());
            }
        } else if !path.starts_with("content/en/") {
            return Err("Invalid document path.".into());
        }
    }
    Ok(languages)
}

/// Mirrors Hugo's default permalink for a content file.
fn route(path: &str) -> String {
    let relative = path.strip_prefix("content/").unwrap_or(path);
    let (language, rest) = relative.split_once('/').unwrap_or(("en", relative));
    let rest = rest.strip_suffix(".md").unwrap_or(rest);
    let rest = rest
        .strip_suffix("_index")
        .or_else(|| rest.strip_suffix("index"))
        .filter(|stripped| stripped.is_empty() || stripped.ends_with('/'))
        .unwrap_or(rest)
        .trim_end_matches('/');
    let prefix = if language == "en" {
        String::new()
    } else {
        format!("/{language}")
    };
    if rest.is_empty() {
        format!("{prefix}/")
    } else {
        format!("{prefix}/{rest}/").to_lowercase()
    }
}

fn unescape(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

fn attribute(tag: &str, name: &str) -> Option<String> {
    let mut rest = tag;
    while let Some(index) = rest.find(name) {
        let before = rest[..index].chars().last();
        let after = &rest[index + name.len()..];
        if before.is_some_and(char::is_whitespace) {
            if let Some(quoted) = after.strip_prefix("=\"") {
                return quoted.find('"').map(|end| unescape(&quoted[..end]));
            }
        }
        rest = after;
    }
    None
}

fn anchors(html: &str) -> Vec<(String, String)> {
    let main = html
        .find("<main")
        .and_then(|start| {
            html[start..]
                .find("</main>")
                .map(|end| &html[start..start + end])
        })
        .unwrap_or(html);
    let mut links = Vec::new();
    let mut rest = main;
    while let Some(start) = rest.find("<a") {
        rest = &rest[start + 2..];
        if !rest.starts_with(|character: char| character.is_whitespace()) {
            continue;
        }
        let Some(end) = rest.find('>') else { break };
        let tag = &rest[..end];
        rest = &rest[end + 1..];
        let Some(href) = attribute(tag, "href") else {
            continue;
        };
        let inner = &rest[..rest.find("</a>").unwrap_or(0)];
        let mut text = String::new();
        let mut in_tag = false;
        for character in inner.chars() {
            match character {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => text.push(character),
                _ => {}
            }
        }
        links.push((
            href,
            unescape(text.split_whitespace().collect::<Vec<_>>().join(" ").trim()),
        ));
    }
    links
}

fn identifiers(html: &str) -> HashSet<String> {
    let mut found = HashSet::new();
    for name in ["id", "name"] {
        let pattern = format!(" {name}=\"");
        let mut rest = html;
        while let Some(index) = rest.find(&pattern) {
            rest = &rest[index + pattern.len()..];
            if let Some(end) = rest.find('"') {
                found.insert(unescape(&rest[..end]));
            }
        }
    }
    found
}

fn redirects(public: &Path) -> Vec<(String, String)> {
    fs::read_to_string(public.join("_redirects"))
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let from = parts.next()?;
            if from.starts_with('#') {
                return None;
            }
            Some((from.to_owned(), parts.next()?.to_owned()))
        })
        .collect()
}

fn redirect(rules: &[(String, String)], path: &str) -> Option<String> {
    let trimmed = path.trim_end_matches('/');
    rules.iter().find_map(|(from, to)| {
        if let Some(prefix) = from.strip_suffix('*') {
            return path
                .strip_prefix(prefix)
                .map(|splat| to.replace(":splat", splat));
        }
        (from.trim_end_matches('/') == trimmed).then(|| to.clone())
    })
}

fn output_file(public: &Path, path: &str) -> Option<PathBuf> {
    let relative = path.trim_start_matches('/');
    if relative.split('/').any(|part| part == ".." || part == ".") {
        return None;
    }
    let candidate = public.join(relative);
    if path.ends_with('/') || candidate.is_dir() {
        let index = candidate.join("index.html");
        return index.is_file().then_some(index);
    }
    candidate.is_file().then_some(candidate)
}

struct Site<'a> {
    root: &'a Path,
    public: &'a Path,
    languages: &'a [String],
    redirects: Vec<(String, String)>,
    identifiers: HashMap<PathBuf, HashSet<String>>,
}

impl Site<'_> {
    fn has_identifier(&mut self, file: &Path, fragment: &str) -> bool {
        if !self.identifiers.contains_key(file) {
            let html = fs::read_to_string(file).unwrap_or_default();
            self.identifiers.insert(file.to_owned(), identifiers(&html));
        }
        self.identifiers[file].contains(fragment)
    }

    fn unbuilt_language(&self, path: &str) -> bool {
        let first = path.trim_start_matches('/').split('/').next().unwrap_or("");
        !first.is_empty()
            && !self.languages.iter().any(|language| language == first)
            && self.root.join("i18n").join(first).is_dir()
    }

    fn classify(&mut self, page: &str, href: &str) -> Option<(&'static str, String)> {
        let base = Url::parse(&format!("{SITE}{page}")).ok()?;
        let target = base.join(href).ok()?;
        if target.origin() != base.origin() {
            return None;
        }
        let path = percent_decode(target.path());
        let fragment = target.fragment().map(percent_decode).unwrap_or_default();
        let resolved = match output_file(self.public, &path) {
            Some(file) => file,
            None if self.unbuilt_language(&path) => {
                return Some((
                    "skipped",
                    format!("{path} belongs to a language outside this build."),
                ))
            }
            None => {
                return Some(match redirect(&self.redirects, &path) {
                    Some(to)
                        if to.contains("://")
                            || output_file(
                                self.public,
                                to.split(['#', '?']).next().unwrap_or(""),
                            )
                            .is_some() =>
                    {
                        (
                            "redirect",
                            format!("{path} only resolves through the _redirects rule to {to}."),
                        )
                    }
                    Some(to) => (
                        "missing",
                        format!("{path} redirects to {to}, which the Hugo build did not generate."),
                    ),
                    None => (
                        "missing",
                        format!(
                        "{path} was not generated by the Hugo build and has no _redirects rule."
                    ),
                    ),
                })
            }
        };
        if !fragment.is_empty()
            && resolved
                .extension()
                .is_some_and(|extension| extension == "html")
            && !self.has_identifier(&resolved, &fragment)
        {
            return Some((
                "anchor",
                format!("#{fragment} is not an element ID in the rendered {path}."),
            ));
        }
        Some(("ok", String::new()))
    }
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                decoded.push(byte);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn diagnostics(output: &str, root: &Path, paths: &[String], success: bool) -> Vec<HugoDiagnostic> {
    let root = format!("{}/", root.display());
    let mut found = Vec::new();
    for line in output.lines() {
        let level = if line.starts_with("ERROR") || line.starts_with("Error:") {
            "error"
        } else if line.starts_with("WARN") {
            "warning"
        } else {
            continue;
        };
        let message = line.replace(&root, "");
        let path = paths
            .iter()
            .find(|path| message.contains(path.as_str()))
            .cloned();
        if path.is_none() && (success || level != "error" || found.len() >= 20) {
            continue;
        }
        let line = path.as_ref().and_then(|path| {
            let after = &message[message.find(&format!("{path}:"))? + path.len() + 1..];
            after
                .split(|character: char| !character.is_ascii_digit())
                .next()?
                .parse()
                .ok()
        });
        found.push(HugoDiagnostic {
            level,
            path,
            line,
            message: message.chars().take(1000).collect(),
        });
    }
    found
}

fn expected_version(root: &Path) -> Option<String> {
    fs::read_to_string(root.join("netlify.toml"))
        .ok()?
        .lines()
        .filter_map(|line| line.trim().strip_prefix("HUGO_VERSION"))
        .filter_map(|value| value.trim().strip_prefix('='))
        .map(|value| value.trim().trim_matches('"').to_owned())
        .next_back()
}

pub fn build_and_check(root: &Path, cache: &Path, paths: &[String]) -> Result<HugoReport, String> {
    let languages = validate_paths(paths)?;
    let hugo = std::env::var("HUGO_BIN").unwrap_or_else(|_| "hugo".into());
    let (_, version) = run(&hugo, &["version"], root, 1)?;
    let version = version.trim().to_owned();
    if !version.contains("extended") {
        return Err(format!(
            "The Kubernetes website requires Hugo extended; found: {version}"
        ));
    }
    if git(root, &["config", "--bool", "core.sparseCheckout"]).unwrap_or_default() == "true" {
        // Shortcodes such as `include` resolve shared snippets from any language.
        let languages = git(root, &["ls-tree", "-d", "--name-only", "HEAD", "content/"])?;
        let includes: Vec<String> = languages
            .lines()
            .map(|directory| format!("{directory}/includes"))
            .collect();
        let mut arguments = vec!["sparse-checkout", "add"];
        arguments.extend(SITE_DIRECTORIES);
        arguments.extend(includes.iter().map(String::as_str));
        git(root, &arguments)?;
    }
    if !root.join("node_modules/docsy").is_dir() {
        let (success, output) = run(
            "npm",
            &["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
            root,
            10,
        )?;
        if !success {
            return Err(format!(
                "npm ci failed while installing the Docsy theme: {}",
                output
                    .chars()
                    .rev()
                    .take(2000)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect::<String>()
            ));
        }
    }
    let work = tempfile::tempdir().map_err(|error| error.to_string())?;
    let overlay = work.path().join("review.toml");
    let includes: String = languages
        .iter()
        .map(|language| format!("[[segments.review.includes]]\nlang = \"{language}\"\n"))
        .collect();
    fs::write(
        &overlay,
        format!("refLinksErrorLevel = \"WARNING\"\n{includes}"),
    )
    .map_err(|error| error.to_string())?;
    let public = work.path().join("public");
    let config = format!("hugo.toml,{}", overlay.display());
    let (success, output) = run(
        &hugo,
        &[
            "--config",
            &config,
            "--destination",
            &public.to_string_lossy(),
            "--cacheDir",
            &cache.to_string_lossy(),
            "--renderSegments",
            "review",
            "--environment",
            "development",
            "--buildDrafts",
            "--buildFuture",
            "--enableGitInfo=false",
            "--noBuildLock",
            "--logLevel",
            "warn",
        ],
        root,
        15,
    )?;
    let mut site = Site {
        root,
        public: &public,
        languages: &languages,
        redirects: redirects(&public),
        identifiers: HashMap::new(),
    };
    let pages = paths
        .iter()
        .map(|path| {
            let route = route(path);
            let html = output_file(&public, &route)
                .filter(|_| success)
                .and_then(|file| fs::read_to_string(file).ok());
            let links = html
                .as_deref()
                .map(anchors)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|(href, text)| {
                    let (status, detail) = site.classify(&route, &href)?;
                    Some(HugoLink {
                        href,
                        text,
                        status,
                        detail,
                    })
                })
                .collect();
            HugoPage {
                path: path.clone(),
                route,
                rendered: html.is_some(),
                links,
            }
        })
        .collect();
    Ok(HugoReport {
        expected_version: expected_version(root),
        version,
        success,
        pages,
        diagnostics: diagnostics(&output, root, paths, success),
    })
}

#[tauri::command]
pub async fn check_hugo_links(
    app: AppHandle,
    state: State<'_, Repository>,
    paths: Vec<String>,
) -> Result<HugoReport, String> {
    let root = state
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or("Load a pull request in the desktop app before building it with Hugo.")?;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("hugo");
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("A Hugo build is already running.".into());
    }
    let result =
        tauri::async_runtime::spawn_blocking(move || build_and_check(&root, &cache, &paths)).await;
    RUNNING.store(false, Ordering::SeqCst);
    result.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_content_files_to_hugo_routes() {
        assert_eq!(
            route("content/en/docs/concepts/overview.md"),
            "/docs/concepts/overview/"
        );
        assert_eq!(
            route("content/es/docs/concepts/_index.md"),
            "/es/docs/concepts/"
        );
        assert_eq!(
            route("content/es/docs/tasks/Page/index.md"),
            "/es/docs/tasks/page/"
        );
        assert_eq!(route("content/en/_index.md"), "/");
        assert_eq!(route("content/en/docs/reindex.md"), "/docs/reindex/");
    }

    #[test]
    fn validates_review_paths() {
        assert_eq!(
            validate_paths(&[
                "content/en/docs/a.md".into(),
                "content/pt-br/docs/a.md".into()
            ])
            .unwrap(),
            ["en", "pt-br"]
        );
        for path in [
            "content/es/../../x.md",
            "content/es/docs/a.txt",
            "static/a.md",
            "content/E/a.md",
        ] {
            assert!(validate_paths(&[path.into()]).is_err(), "{path}");
        }
    }

    #[test]
    fn extracts_main_content_links_and_identifiers() {
        let html = r##"<nav><a href="/nav/">Nav</a></nav><main><h2 id="pods">Pods</h2>
            <a href="/docs/a/?x=1&amp;y=2#b" title="t"><code>A</code> link</a><abbr>no</abbr>
            <a class="x" href="#pods">Pods</a></main><footer><a href="/f/">F</a></footer>"##;
        assert_eq!(
            anchors(html),
            [
                ("/docs/a/?x=1&y=2#b".to_owned(), "A link".to_owned()),
                ("#pods".to_owned(), "Pods".to_owned())
            ]
        );
        assert!(identifiers(html).contains("pods"));
    }

    #[test]
    fn classifies_rendered_links() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        let public = root.join("public");
        fs::create_dir_all(public.join("docs/a")).unwrap();
        fs::create_dir_all(public.join("es/docs/b")).unwrap();
        fs::create_dir_all(public.join("images")).unwrap();
        fs::create_dir_all(root.join("i18n/ja")).unwrap();
        fs::write(public.join("docs/a/index.html"), r#"<h2 id="real">x</h2>"#).unwrap();
        fs::write(
            public.join("es/docs/b/index.html"),
            r#"<h2 id="señal">x</h2>"#,
        )
        .unwrap();
        fs::write(public.join("images/x.png"), "").unwrap();
        fs::write(
            public.join("_redirects"),
            "# comment\n/docs/old/  /docs/a/ 301\n/docs/gone/* /docs/none/:splat 301\n/docs/k/kubectl_* /docs/a#:splat 301\n",
        )
        .unwrap();
        let languages = ["en".to_owned(), "es".to_owned()];
        let mut site = Site {
            root,
            public: &public,
            languages: &languages,
            redirects: redirects(&public),
            identifiers: HashMap::new(),
        };
        let status = |site: &mut Site, href: &str| site.classify("/es/docs/b/", href).map(|r| r.0);
        assert_eq!(status(&mut site, "/docs/a/#real"), Some("ok"));
        assert_eq!(status(&mut site, "../../../docs/a"), Some("ok"));
        assert_eq!(status(&mut site, "#se%C3%B1al"), Some("ok"));
        assert_eq!(status(&mut site, "/images/x.png"), Some("ok"));
        assert_eq!(status(&mut site, "/docs/a/#generated"), Some("anchor"));
        assert_eq!(status(&mut site, "/docs/missing/"), Some("missing"));
        assert_eq!(status(&mut site, "/docs/old"), Some("redirect"));
        assert_eq!(status(&mut site, "/docs/gone/page/"), Some("missing"));
        assert_eq!(status(&mut site, "/docs/k/kubectl_get/"), Some("redirect"));
        assert_eq!(status(&mut site, "/ja/docs/a/"), Some("skipped"));
        assert_eq!(status(&mut site, "https://example.com/docs/missing/"), None);
        assert_eq!(
            status(&mut site, "https://kubernetes.io/docs/missing/"),
            Some("missing")
        );
    }

    #[test]
    fn keeps_diagnostics_for_reviewed_files() {
        let root = Path::new("/tmp/pr-1");
        let output = "WARN  noise\n\
            WARN  [es] REF_NOT_FOUND: Ref \"x\": \"/tmp/pr-1/content/es/docs/b.md:12:5\": page not found\n\
            ERROR other failure\n";
        let paths = ["content/es/docs/b.md".to_owned()];
        let found = diagnostics(output, root, &paths, true);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].line, Some(12));
        assert_eq!(found[0].path.as_deref(), Some("content/es/docs/b.md"));
        assert!(!found[0].message.contains("/tmp/pr-1"));
        assert_eq!(diagnostics(output, root, &paths, false).len(), 2);
    }

    #[test]
    #[ignore = "Builds a local kubernetes/website checkout with Hugo; set K8S_WEBSITE_CHECKOUT"]
    fn builds_kubernetes_website_checkout() {
        let root = PathBuf::from(std::env::var("K8S_WEBSITE_CHECKOUT").unwrap());
        let cache = tempfile::tempdir().unwrap();
        let paths = std::env::var("K8S_WEBSITE_PAGES")
            .unwrap_or("content/en/docs/concepts/overview/_index.md,content/es/docs/concepts/overview/_index.md".into());
        let paths: Vec<String> = paths.split(',').map(str::to_owned).collect();
        let report = build_and_check(&root, cache.path(), &paths).unwrap();
        for diagnostic in &report.diagnostics {
            eprintln!("{diagnostic:?}");
        }
        assert!(report.success);
        for page in &report.pages {
            assert!(page.rendered, "{}", page.path);
            for link in page.links.iter().filter(|link| link.status != "ok") {
                eprintln!("{} {link:?}", page.path);
            }
            assert!(page.links.iter().any(|link| link.status == "ok"));
        }
    }
}
