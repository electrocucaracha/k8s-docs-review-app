# Kubernetes Docs Review

[Documentation](https://electrocucaracha.github.io/k8s-docs-review-app/)
| [First review](docs/tutorials/first-review.md)
| [Contributing](CONTRIBUTING.md)

Kubernetes Docs Review is a local workspace for reviewing English sources and
Markdown translations in `kubernetes/website` pull requests. It pairs each
translation with its English source and combines deterministic checks with
optional AI-assisted review.

The app runs in a browser or as a native desktop app. Offline review requires
no backend, Azure account, or API key. Browser mode never writes to your
checkout; the desktop app can save translations in its app-managed checkout.

## How It Works

Choose a supported translation language, with Spanish selected by default,
then select an open PR with that language's label. The explorer loads its added
or modified Markdown files at the PR's exact revision. Inspect findings next to
the English source, edit the translation, and export it or save it from the
desktop app. AI review and checks against published Kubernetes documentation
are optional.

## Key Capabilities

- **Offline review checks** for links, anchors, structure, metadata, and
  untranslated text.
- **Optional LLM review** with Ollama, OpenAI, Anthropic, Gemini, and
  OpenAI-compatible providers.
- **Published-reference checks** for Kubernetes documentation URLs, with
  GitHub issue drafts for missing pages.
- **Browser and desktop workflows** for reviewing PRs, editing translations,
  and exporting or saving drafts.

## Run in a Browser

Install Node.js 22.12 or newer and npm:

```sh
git clone https://github.com/electrocucaracha/k8s-docs-review-app.git
cd k8s-docs-review-app
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The app starts with a clearly labeled example
workspace. See the [user guide](docs/user-guide.md) for PR loading, editing,
review checks, and provider setup.

## Run as a Desktop App

Install Rust and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/),
then run:

```sh
npm ci
npm run desktop
```

See the [user guide](docs/user-guide.md#run-as-a-desktop-app) for checkout and
save behavior, and [CONTRIBUTING.md](CONTRIBUTING.md) for build and test
instructions.

## Documentation

- [Documentation home](docs/index.md) — tutorials, task guides, reference, and explanations.
- [User guide](docs/user-guide.md) — PR loading, editing, AI review, and published-reference checks.
- [Configuration](docs/references/configuration.md) — provider defaults, runtime selection, and limits.
- [Troubleshooting](docs/how-to-guides/troubleshooting.md) — request failures and save conflicts.
- [How review works](docs/explanations/how-review-works.md) — architecture and human-review boundaries.
- [Spanish review coverage](docs/spanish-review-coverage.md) — historical evidence behind checks.
- [Publish to GitHub Pages](docs/publishing.md) — preview and enable automated publishing.

GitHub Pages hosts the documentation only.
The review app runs locally; AI review and published-reference checks need
the development server or desktop runtime, not a static Pages deployment.

This is an independent review tool, not an official Kubernetes project.
