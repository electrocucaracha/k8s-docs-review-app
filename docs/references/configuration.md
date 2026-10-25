---
title: Configuration
parent: Reference
nav_order: 1
---

# Configuration

Settings apply to optional LLM review.
Offline checks do not require a provider configuration.

## Provider defaults

| Provider | Default model | Default endpoint |
| --- | --- | --- |
| Ollama | `llama3.2` | `http://127.0.0.1:11434` |
| OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Anthropic | `claude-sonnet-4-5` | `https://api.anthropic.com` |
| Google Gemini | `gemini-2.5-flash` | Unset; the LiteLLM provider supplies it |
| OpenAI-compatible | `local-model` | `http://127.0.0.1:4000/v1` |

These are application defaults, not guarantees that an account has access to a model.
The model field accepts at most 200 characters.
Ollama and OpenAI-compatible providers require an endpoint.
Non-local endpoints require HTTPS.
Endpoint URLs cannot contain credentials, query strings, or fragments.

## Python runtime

Python 3.10 or newer and the packages in the project's `requirements.txt`
are required for LLM review in both browser development and desktop mode.

Runtime selection follows this precedence:

1. **Python executable** configured in Settings.
2. The `K8S_DOCS_REVIEW_PYTHON` environment variable.
3. The project's `.venv` interpreter in development.
4. The system interpreter: `python3` on macOS/Linux or `python` on Windows.

The executable basename must be a Python interpreter name,
such as `python`, `python3`, `python3.10`, or `python.exe`.
The packaged app includes the review helper and requirements manifest,
not an interpreter or installed dependencies.

## Review tasks

The initial rubric enables six tasks:
translation accuracy, content completeness, Spanish grammar,
terminology, technical fidelity, and Markdown and metadata.
Built-in prompts adapt to the selected language.
Edited and custom instructions remain unchanged.
History-backed deterministic Spanish editorial checks apply only to Spanish.

| Setting | Default | Allowed values |
| --- | --- | --- |
| Parallel task limit | `1` | Integers from `1` to `4` |
| Configured tasks | Six built-in tasks | At most `20` |
| Task enabled | Enabled for built-in tasks | Enabled or disabled per task |

Each enabled task makes a separate request.
Results and failures are tracked independently.
Edits to documents or task configuration invalidate previous results.

## Persistence and network behavior

| Data or action | Behavior |
| --- | --- |
| Provider, model, endpoint, Python path, task settings | Stored locally across sessions |
| API key entered in Settings | Memory only for the current session |
| Provider environment credentials | Available to the local Python helper through its environment |
| Browser translation drafts | Memory only; retained during file switching, not reloads or workspace replacement |
| Desktop saves | Existing Markdown under the app-managed `content/<language>/` checkout |
| Offline review | Local parsing and comparison; no document submission |
| LLM connection test | Short probe to the configured provider |
| LLM review | Current document pair submitted on explicit request; remote providers require confirmation |
| Published-reference check | Explicit HTTP requests restricted to Kubernetes documentation |
| Pull request loading | GitHub network requests; desktop mode also uses Git |

API keys pass to the helper through standard input rather than command arguments.
The app includes no telemetry.

## Limits

| Surface | Limit |
| --- | --- |
| Repository index | 50,000 files |
| Loaded Markdown | 100 MB total; 4 MB per document |
| LLM document pair | 100,000 characters |
| LLM request duration | Three minutes |
| Published pages per document pair | 100 distinct pages |
| Concurrent published-page checks | Four |
| Published-page request deadline | 15 seconds |
| Published-page redirects | Five, within Kubernetes documentation only |

The model's own context limit still applies.
Published checks establish page availability,
not published fragment correctness or semantic accuracy.

## Related documentation

- [Configure LLM review](../user-guide.md#configure-llm-review).
- [Recover from a failed request](../how-to-guides/troubleshooting.md).
- [Understand review limitations](../explanations/how-review-works.md).
