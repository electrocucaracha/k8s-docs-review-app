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

## Python Environment

Python 3.10 or newer is needed for LLM review. Create a local environment and
install its dependencies on macOS or Linux:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

On Windows:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Development mode discovers this environment automatically. The packaged
desktop app includes the review helper, but not a Python interpreter or
LiteLLM dependencies.

## Validation

Run the focused checks and test suites with:

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
```

The Python command assumes the virtual environment above; on Windows, replace
`.venv/bin/python` with `.\.venv\Scripts\python.exe`.

Browser tests cover PR loading, provider settings and session-only credentials,
task settings migration and custom-task persistence, parallel execution and
failed-task retries, LLM findings and invalidation, filters, finding
navigation, draft retention, translation downloads, published-reference
classification and issue drafts, and desktop/mobile layout.

Native tests cover repository indexing, checkout refresh and local-edit
preservation, locale-specific translation saves, external-change conflicts, path traversal,
symlink escapes, and documentation URL and issue-draft opener restrictions.
Python tests validate LiteLLM request routing and response schemas, including
task-specific prompt scoping and the real SDK against a local
Ollama-protocol fixture.

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
