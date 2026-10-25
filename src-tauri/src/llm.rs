use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};
use tauri::{AppHandle, Manager};
use wait_timeout::ChildExt;

fn validate_python(executable: &str) -> Result<(), String> {
    let name = Path::new(executable)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Choose a Python executable.")?
        .to_ascii_lowercase();
    let name = name.strip_suffix(".exe").unwrap_or(&name);
    let valid = name == "python"
        || name.strip_prefix("python").is_some_and(|version| {
            !version.is_empty()
                && version
                    .split('.')
                    .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
        });
    if !valid {
        return Err("Choose a Python executable, not a shell command.".into());
    }
    Ok(())
}

fn execute(script: &Path, python: &str, request: Value) -> Result<Value, String> {
    validate_python(python)?;
    let payload = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
    if payload.len() > 1024 * 1024 {
        return Err("The LLM request exceeds 1 MB.".into());
    }
    let mut child = Command::new(python).arg(script)
        .env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|_| "Could not start Python. Configure the Python executable in Settings and install requirements.txt.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Could not read the LiteLLM response.")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let write = child
        .stdin
        .take()
        .ok_or("Could not send the LiteLLM request.")?
        .write_all(&payload);
    if write.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Could not send the LiteLLM request to Python.".into());
    }
    let Some(status) = child
        .wait_timeout(Duration::from_secs(180))
        .map_err(|_| "Could not wait for LiteLLM.".to_string())?
    else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("The LLM request timed out after three minutes.".into());
    };
    let output = reader
        .join()
        .map_err(|_| "Could not read the LiteLLM response.")?
        .map_err(|_| "Could not read the LiteLLM response.")?;
    if !status.success() {
        return Err(
            "The LiteLLM helper failed. Check the Python environment and requirements.txt.".into(),
        );
    }
    if output.len() > 1024 * 1024 {
        return Err("The LLM response is too large.".into());
    }
    serde_json::from_slice(&output).map_err(|_| "The LiteLLM helper returned invalid JSON.".into())
}

#[tauri::command]
pub async fn review_with_llm(app: AppHandle, request: Value) -> Result<Value, String> {
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("Missing application directory.")?
        .to_owned();
    let script = if cfg!(debug_assertions) {
        project.join("llm/review.py")
    } else {
        app.path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("llm/review.py")
    };
    if !script.is_file() {
        return Err("The bundled LiteLLM helper was not found.".into());
    }
    let configured = request
        .pointer("/settings/pythonExecutable")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let virtual_python = project.join(if cfg!(windows) {
        ".venv/Scripts/python.exe"
    } else {
        ".venv/bin/python"
    });
    let python = configured
        .or_else(|| std::env::var("K8S_DOCS_REVIEW_PYTHON").ok())
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) && fs::metadata(&virtual_python).is_ok() {
                virtual_python.to_string_lossy().into_owned()
            } else if cfg!(windows) {
                "python".into()
            } else {
                "python3".into()
            }
        });
    tauri::async_runtime::spawn_blocking(move || execute(&script, &python, request))
        .await
        .map_err(|_| "The LLM worker failed.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_accepts_python_executables() {
        for value in [
            "python",
            "python3",
            "python3.13",
            "python.exe",
            "/tmp/env/bin/python",
        ] {
            assert!(validate_python(value).is_ok());
        }
        for value in [
            "sh",
            "rm",
            "python -c malicious",
            "python;command",
            "python.",
            "python3.sh",
        ] {
            assert!(validate_python(value).is_err());
        }
    }
}
