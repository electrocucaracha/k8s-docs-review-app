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
| Ollama | `qwen3.8:27b-q4_K_M` | `http://127.0.0.1:11434` |
| OpenAI | `gpt-4o-mini` | `https://api.openai.com/v1` |
| Anthropic | `claude-sonnet-4-5` | `https://api.anthropic.com` |
| Google Gemini | `gemini-2.5-flash` | Unset; the AI SDK uses `https://generativelanguage.googleapis.com/v1beta` |
| OpenAI-compatible | `local-model` | `http://127.0.0.1:4000/v1` |

These are application defaults, not guarantees that an account has access to a model.
The Ollama default targets multilingual translation review on a Mac mini M4
with 64 GB of unified memory and explicitly selects the GGUF Q4_K_M flavor.
Context and runtime need additional memory beyond the model weights.
Install it with `ollama pull qwen3.8:27b-q4_K_M`. Keep the parallel task limit at `1`
to limit memory pressure. Actual speed depends on document length and context;
this is a quality-oriented starting point, not a hardware benchmark.
The model remains editable, and existing saved model choices are preserved.
The model field accepts at most 200 characters.
Ollama and OpenAI-compatible providers require an endpoint.
Ollama endpoints may use HTTP on remote hosts. Other providers require HTTPS
for non-local endpoints.
Endpoint URLs cannot contain credentials, query strings, or fragments.
Remote Ollama traffic over HTTP is unencrypted; use a trusted network or HTTPS
when available.

## LLM runtime and credentials

The TypeScript AI SDK provides the common provider API. Browser development
executes it in the Vite server; desktop executes it in the webview using native
Rust HTTP requests. Python and an installed Node.js runtime are not required
by the packaged app. Saved legacy Python executable settings are ignored.

Ollama uses its OpenAI-compatible `/v1/chat/completions` endpoint; the app adds
`/v1` to the configured Ollama base if necessary. Anthropic bases accept either
the service root or a trailing `/v1`. Custom Gemini bases should include their
API version, such as `/v1beta`. Provider redirects are not followed.

An API key entered in Settings takes precedence over launch-environment keys:
`OPENAI_API_KEY` for OpenAI and OpenAI-compatible endpoints,
`ANTHROPIC_API_KEY` for Anthropic, and `GEMINI_API_KEY`,
`GOOGLE_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` (in that order) for Gemini.
Ollama and unauthenticated OpenAI-compatible endpoints need no key.

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
| Provider, model, endpoint, task settings | Stored locally across sessions |
| API key entered in Settings | Memory only for the current session |
| Provider environment credentials | Read from the Vite server or desktop app launch environment; not persisted |
| Browser translation drafts | Memory only; retained during file switching, not reloads or workspace replacement |
| Desktop saves | Existing Markdown under the app-managed `content/<language>/` checkout |
| Offline review | Local parsing and comparison; no document submission |
| LLM connection test | Short probe to the configured provider |
| LLM review | Current document pair submitted on explicit request; remote providers require confirmation |
| Published-reference check | Explicit HTTP requests restricted to Kubernetes documentation |
| Pull request loading | GitHub network requests; desktop mode also uses Git |

API keys are supplied in request headers, never command arguments or logs.
The app includes no telemetry.

## Limits

| Surface | Limit |
| --- | --- |
| Repository index | 50,000 files |
| Loaded Markdown | 100 MB total; 4 MB per document |
| LLM document pair | 100,000 characters |
| LLM request duration | Three minutes |
| Provider HTTP deadline | 150 seconds |
| LLM request / provider response | 1 MB each |
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
