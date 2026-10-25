# Contributing

## Development Setup

Install Node.js 22.12 or newer and npm, then install the project dependencies:

```sh
npm ci
```

Start the browser development server with `npm run dev`. To work on the
desktop app, install Rust and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
Windows requires Microsoft C++ Build Tools and WebView2; macOS requires Xcode
Command Line Tools; Linux requires WebKitGTK 4.1 development libraries and
related packages.

Desktop PR loading requires Git on PATH. Stop any existing preview on port
5173 before starting desktop development:

```sh
npm run desktop
```

To package the app for the current operating system:

```sh
npm run desktop:build
```

Installers are written under `src-tauri/target/release/bundle/`. Build Windows
installers on Windows, macOS apps on macOS, and Linux packages on Linux.
Signing and notarization are not configured.

## LLM Providers

LLM review uses the TypeScript [AI SDK](https://ai-sdk.dev/) with OpenAI,
Anthropic, and Google provider adapters. Ollama uses its OpenAI-compatible
`/v1/chat/completions` API. The SDK runs in the Vite server during browser
development and in the desktop webview with a restricted Rust HTTP transport.
The packaged app requires neither Python nor an installed Node.js runtime.

Configure the provider, endpoint, model, and session-only API key in Settings.
Alternatively, launch the Vite server or desktop app with `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` set. Gemini also accepts
`GOOGLE_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`.

## Validation

Install [pre-commit](https://pre-commit.com/) and enable the hooks:

```sh
python -m pip install pre-commit
pre-commit install
```

Run them manually across all files with `pre-commit run --all-files`.

Run the focused checks and test suites with:

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
python3 -m unittest discover -s tests -p 'test_review_history.py' -v
```

Python is only needed for the optional history-audit tooling and pre-commit
hooks, not to run the app or LLM reviews. On Windows, use `py` instead of
`python3` for the history tests.

Browser tests cover PR loading, provider settings and session-only credentials,
task settings migration and custom-task persistence, parallel execution and
failed-task retries, LLM findings and invalidation, filters, finding
navigation, draft retention, translation downloads, published-reference
classification and issue drafts, and desktop/mobile layout.

Native tests cover repository indexing, checkout refresh and local-edit
preservation, locale-specific translation saves, external-change conflicts, path traversal,
symlink escapes, and documentation URL and issue-draft opener restrictions.
TypeScript tests validate all five provider routes and response schemas,
task-specific prompt scoping, credential handling, and the real SDK against a
local Ollama-compatible HTTP fixture. Native tests also validate LLM endpoint
restrictions. Python tests cover only the optional history-audit tooling.

An optional live published-page check can be run explicitly:

```sh
cargo test --manifest-path src-tauri/Cargo.toml live_published_pages -- --ignored
```

## Documentation

The documentation uses Jekyll and Just the Docs, independently of the Vite app.
Follow [Publish to GitHub Pages](docs/publishing.md) for Ruby prerequisites,
local preview commands, and repository setup.
Documentation changes are built on pull requests and published from `main`
after GitHub Pages is configured to use GitHub Actions.

Keep task procedures in the [user guide](docs/user-guide.md) or a focused how-to page,
exact defaults in the [configuration reference](docs/references/configuration.md),
and design rationale in the [explanations](docs/explanations/index.md).
Update related pages when observable behavior changes.
Use relative links inside `docs/` and absolute GitHub links to repository files
outside the published site.
Preserve existing page paths and heading anchors.

Before submitting documentation changes, build from `docs/`:

```sh
bundle install
bundle exec jekyll build --strict_front_matter --trace
```

Check navigation, search, code blocks, and internal links in the local preview.
Do not commit `_site/`, dependency caches, or credentials.
