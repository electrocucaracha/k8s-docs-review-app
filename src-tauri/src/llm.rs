use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    redirect::Policy,
    Client, Url,
};
use serde::Serialize;
use std::{collections::HashMap, time::Duration};
use tauri::State;

pub struct LlmTransport {
    client: Client,
    active: std::sync::atomic::AtomicUsize,
}

impl LlmTransport {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            client: Client::builder()
                .redirect(Policy::none())
                .timeout(Duration::from_secs(150))
                .build()?,
            active: std::sync::atomic::AtomicUsize::new(0),
        })
    }
}

fn validate_endpoint(value: &str, allow_remote_http: bool) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid provider endpoint.")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
    {
        return Err(
            "Use an HTTP(S) provider endpoint without credentials or query parameters.".into(),
        );
    }
    if !allow_remote_http
        && url.scheme() == "http"
        && !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
    {
        return Err("Remote provider endpoints must use HTTPS.".into());
    }
    Ok(url)
}

#[derive(Serialize)]
pub struct LlmResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

#[tauri::command]
pub fn llm_environment(provider: String) -> Result<HashMap<String, String>, String> {
    let names: &[&str] = match provider.as_str() {
        "openai" | "openai-compatible" => &["OPENAI_API_KEY"],
        "anthropic" => &["ANTHROPIC_API_KEY"],
        "gemini" => &[
            "GEMINI_API_KEY",
            "GOOGLE_API_KEY",
            "GOOGLE_GENERATIVE_AI_API_KEY",
        ],
        "ollama" => &[],
        _ => return Err("Select a supported LLM provider.".into()),
    };
    Ok(names
        .into_iter()
        .filter_map(|name| {
            std::env::var(name)
                .ok()
                .map(|value| (name.to_string(), value))
        })
        .collect())
}

#[tauri::command]
pub async fn llm_fetch(
    transport: State<'_, LlmTransport>,
    url: String,
    provider: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<LlmResponse, String> {
    send_request(&transport, url, provider, headers, body).await
}

async fn send_request(
    transport: &LlmTransport,
    url: String,
    provider: String,
    headers: HashMap<String, String>,
    body: String,
) -> Result<LlmResponse, String> {
    use std::sync::atomic::Ordering;
    let endpoint = validate_endpoint(&url, provider == "ollama")?;
    if body.len() > 1024 * 1024 {
        return Err("The LLM request exceeds 1 MB.".into());
    }
    let mut outgoing = HeaderMap::new();
    for (name, value) in headers {
        if !matches!(
            name.as_str(),
            "content-type"
                | "authorization"
                | "x-api-key"
                | "x-goog-api-key"
                | "anthropic-version"
                | "anthropic-beta"
                | "user-agent"
        ) {
            return Err("Unsupported LLM request header.".into());
        }
        outgoing.insert(
            HeaderName::from_bytes(name.as_bytes()).map_err(|_| "Invalid LLM header.")?,
            HeaderValue::from_str(&value).map_err(|_| "Invalid LLM header.")?,
        );
    }
    let previous = transport.active.fetch_add(1, Ordering::SeqCst);
    struct Active<'a>(&'a std::sync::atomic::AtomicUsize);
    impl Drop for Active<'_> {
        fn drop(&mut self) {
            self.0.fetch_sub(1, Ordering::SeqCst);
        }
    }
    let _active = Active(&transport.active);
    if previous >= 4 {
        return Err("The four-request LLM limit was reached.".into());
    }
    let mut response = transport
        .client
        .post(endpoint)
        .headers(outgoing)
        .body(body)
        .send()
        .await
        .map_err(|_| "Could not connect to the LLM provider. Check the endpoint and connection.")?;
    if response.status().is_redirection() {
        return Err(
            "Provider redirects are not accepted. Configure the final endpoint in Settings.".into(),
        );
    }
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter(|(name, _)| matches!(name.as_str(), "content-type" | "retry-after"))
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_owned()))
        })
        .collect();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read the LLM response.")?
    {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err("The LLM response is too large.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes).map_err(|_| "The LLM response is not UTF-8.")?;
    Ok(LlmResponse {
        status,
        headers,
        body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    #[test]
    fn validates_provider_endpoints() {
        for url in [
            "http://localhost:11434/v1/chat/completions",
            "http://[::1]:11434/v1/chat/completions",
            "http://remote.invalid/v1",
            "https://api.openai.com/v1/chat/completions",
        ] {
            assert!(validate_endpoint(url, true).is_ok(), "{url}");
        }
        assert!(validate_endpoint("http://remote.invalid/v1", false).is_err());
        for url in [
            "file:///tmp/model",
            "https://key@example.invalid/v1",
            "https://example.invalid?key=secret",
            "https://example.invalid/#fragment",
        ] {
            assert!(validate_endpoint(url, true).is_err(), "{url}");
        }
    }

    #[test]
    fn native_http_preserves_provider_responses_and_rejects_redirects() {
        for (status, body) in [
            ("200 OK", "{\"choices\":[]}"),
            ("401 Unauthorized", "{\"error\":\"invalid key\"}"),
            ("302 Found", ""),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let worker = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut request = [0; 4096];
                let count = socket.read(&mut request).unwrap();
                let text = String::from_utf8_lossy(&request[..count]);
                assert!(text.starts_with("POST /v1/chat/completions "));
                assert!(text
                    .to_ascii_lowercase()
                    .contains("authorization: bearer fixture-key"));
                write!(socket, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nLocation: https://redirect.invalid\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            });
            let mut transport = LlmTransport::new().unwrap();
            transport.client = Client::builder()
                .no_proxy()
                .redirect(Policy::none())
                .build()
                .unwrap();
            let result = tauri::async_runtime::block_on(send_request(
                &transport,
                format!("http://{address}/v1/chat/completions"),
                "ollama".into(),
                HashMap::from([("authorization".into(), "Bearer fixture-key".into())]),
                "{}".into(),
            ));
            if status.starts_with("302") {
                assert!(result.err().unwrap().contains("redirects"));
            } else {
                let response = result.unwrap();
                assert_eq!(
                    response.status,
                    if status.starts_with("200") { 200 } else { 401 }
                );
                assert_eq!(response.body, body);
            }
            assert_eq!(
                transport.active.load(std::sync::atomic::Ordering::SeqCst),
                0
            );
            worker.join().unwrap();
        }
    }

    #[test]
    fn enforces_request_size_headers_and_concurrency_before_network_access() {
        let transport = LlmTransport::new().unwrap();
        let send = |headers, body| {
            tauri::async_runtime::block_on(send_request(
                &transport,
                "http://localhost:11434/v1/chat/completions".into(),
                "ollama".into(),
                headers,
                body,
            ))
        };
        assert!(send(HashMap::new(), "a".repeat(1024 * 1024 + 1))
            .err()
            .unwrap()
            .contains("exceeds 1 MB"));
        assert!(send(
            HashMap::from([("host".into(), "untrusted.invalid".into())]),
            "{}".into()
        )
        .err()
        .unwrap()
        .contains("Unsupported"));
        transport
            .active
            .store(4, std::sync::atomic::Ordering::SeqCst);
        assert!(send(HashMap::new(), "{}".into())
            .err()
            .unwrap()
            .contains("four-request"));
    }
}
