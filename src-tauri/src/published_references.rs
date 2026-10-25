use reqwest::{redirect::Policy, Url};
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedResponse {
    url: String,
    final_url: Option<String>,
    status: Option<u16>,
    error: Option<String>,
}

fn documentation_url(value: &str) -> Result<Url, String> {
    if value.len() > 2048 {
        return Err("Reference URL is too long.".into());
    }
    let mut url = Url::parse(value).map_err(|_| "Invalid reference URL.")?;
    let path: Vec<_> = url.path().trim_start_matches('/').split('/').collect();
    let locale = path.first().is_some_and(|locale| {
        let mut parts = locale.split('-');
        let language = parts.next().unwrap_or("");
        language.len() == 2
            && language.bytes().all(|byte| byte.is_ascii_lowercase())
            && parts
                .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_lowercase()))
    });
    let docs = path.first() == Some(&"docs") || (locale && path.get(1) == Some(&"docs"));
    if url.scheme() != "https"
        || url.host_str() != Some("kubernetes.io")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || !docs
    {
        return Err("Only HTTPS Kubernetes documentation URLs can be checked.".into());
    }
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn issue_url(value: &str) -> Result<Url, String> {
    if value.len() > 16_384 {
        return Err("Issue draft URL is too long.".into());
    }
    let url = Url::parse(value).map_err(|_| "Invalid issue URL.")?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/kubernetes/website/issues/new"
    {
        return Err("Only Kubernetes website issue drafts can be opened.".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn check_published_reference(url: String) -> Result<PublishedResponse, String> {
    let mut target = documentation_url(&url)?;
    let original = target.to_string();
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(Policy::none())
        .timeout(Duration::from_secs(15))
        .user_agent("K8sDocsReview/0.1 (documentation-reference-check)")
        .build()
        .map_err(|_| "Could not initialize HTTPS checks.")?;
    let started = Instant::now();
    for redirects in 0..=5 {
        let remaining = Duration::from_secs(15).saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return Ok(PublishedResponse {
                url: original,
                final_url: None,
                status: None,
                error: Some("Network timeout".into()),
            });
        }
        let response = match client
            .get(target.clone())
            .timeout(remaining)
            .header("Accept", "text/html")
            .send()
            .await
        {
            Ok(response) => response,
            Err(_) => {
                return Ok(PublishedResponse {
                    url: original,
                    final_url: None,
                    status: None,
                    error: Some("Network timeout or blocked request".into()),
                })
            }
        };
        let status = response.status().as_u16();
        if [301, 302, 303, 307, 308].contains(&status) {
            let next = response
                .headers()
                .get("location")
                .and_then(|header| header.to_str().ok())
                .and_then(|location| target.join(location).ok())
                .and_then(|next| documentation_url(next.as_str()).ok());
            if redirects == 5 || next.is_none() {
                return Ok(PublishedResponse {
                    url: original,
                    final_url: None,
                    status: None,
                    error: Some(
                        "Redirect could not be verified within Kubernetes documentation".into(),
                    ),
                });
            }
            target = next.ok_or("Invalid redirect.")?;
            continue;
        }
        return Ok(PublishedResponse {
            url: original,
            final_url: Some(target.to_string()),
            status: Some(status),
            error: None,
        });
    }
    Err("Reference redirect limit reached.".into())
}

#[tauri::command]
pub fn open_issue_draft(app: AppHandle, url: String) -> Result<(), String> {
    let url = issue_url(&url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "Could not open the GitHub issue draft in your browser.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Contacts the public Kubernetes documentation website"]
    fn live_published_pages_return_success_and_not_found() {
        let existing = tauri::async_runtime::block_on(check_published_reference(
            "https://kubernetes.io/docs/concepts/overview/".into(),
        ))
        .unwrap();
        assert_eq!(existing.status, Some(200), "{:?}", existing.error);
        let missing = tauri::async_runtime::block_on(check_published_reference(
            "https://kubernetes.io/docs/__k8s_docs_review_missing_page__/".into(),
        ))
        .unwrap();
        assert_eq!(missing.status, Some(404), "{:?}", missing.error);
    }

    #[test]
    fn only_checks_published_kubernetes_documentation() {
        for value in [
            "https://kubernetes.io/docs/",
            "https://kubernetes.io/es/docs/concepts/",
            "https://kubernetes.io/zh-cn/docs/",
        ] {
            assert!(documentation_url(value).is_ok());
        }
        for value in [
            "http://kubernetes.io/docs/",
            "https://kubernetes.io.evil.example/docs/",
            "https://127.0.0.1/docs/",
            "https://key@kubernetes.io/docs/",
            "https://kubernetes.io/blog/",
            "https://kubernetes.io:444/docs/",
            "file:///docs/",
        ] {
            assert!(documentation_url(value).is_err());
        }
        assert_eq!(
            documentation_url("https://kubernetes.io/docs/?key=secret#heading")
                .unwrap()
                .as_str(),
            "https://kubernetes.io/docs/"
        );
    }

    #[test]
    fn only_opens_issue_creation_drafts() {
        assert!(
            issue_url("https://github.com/kubernetes/website/issues/new?title=Missing%20page")
                .is_ok()
        );
        for value in [
            "https://github.com/other/repo/issues/new",
            "https://github.com/kubernetes/website/issues",
            "https://evil.example/kubernetes/website/issues/new",
            "javascript:alert(1)",
        ] {
            assert!(issue_url(value).is_err());
        }
    }
}
