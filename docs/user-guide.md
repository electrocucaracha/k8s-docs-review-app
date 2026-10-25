---
title: User guide
parent: How-to guides
nav_order: 1
---

# User guide

This guide covers reviewing a Kubernetes site pull request, editing
translations, configuring optional AI review, and checking published
documentation references.

Start the local app using the [first-review tutorial](tutorials/first-review.md).
For exact defaults and limits, use the [configuration reference](references/configuration.md).
If an operation fails, see [Troubleshooting](how-to-guides/troubleshooting.md).

## Load a pull request

Choose a language from the combobox; Spanish is selected by default.
Supported languages are discovered from the repository's translation folders
and GitHub `language/*` labels. The pull request combobox loads all open PRs
with the matching label. Select a PR to load its added or modified Markdown
files in that language into the explorer automatically. Use **Refresh pull
requests** to update the list or retry a failed request.

The PR information shows the full **Head commit** SHA linked to the loaded
commit on GitHub. After a contributor pushes fixes or applies suggestions,
refresh the list and select the same PR again to load its latest head. If the
head changed, **Changes since** links to the file and line differences between
the previously loaded commit and the new one. This comparison is kept while
that PR remains open in the app; switching PRs or restarting clears it.
Desktop checkouts with local edits keep showing their cached head instead.

For a PR with multiple commits, expand **Compare PR commits** in the explorer,
select the **From** and **To** commits, and choose **Compare commits**. The
explorer lists Markdown files changed between those revisions. Select a file
to view its contents at both commits side by side. Choose **Back to PR review**
to return to the translation review.

Browser mode downloads these files and their English
counterparts at the PR's exact head revision and reuses already loaded
revisions in the session. It indices the repository tree for local reference
checks. GitHub's public API rate limits apply.

Translation edits stay in memory when switching files. Download the translation
before closing the browser or replacing the workspace. Browser mode never
writes directly to your checkout. Cross-file anchors without loaded target
Markdown remain explicitly unchecked.

## Run as a desktop app

Install Rust and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
Windows needs Microsoft C++ Build Tools and WebView2. macOS needs Xcode
command-line tools. Linux needs the platform's WebKitGTK 4.1 development
libraries and related packages.

Start desktop development with:

```sh
npm install
npm run desktop
```

Stop any existing preview on port 5173 before starting desktop development.
To package for the current operating system:

```sh
npm run desktop:build
```

Installers are written under `src-tauri/target/release/bundle/`. Build Windows
installers on Windows, macOS applications on macOS, and Linux packages on
Linux. Signing and notarization require your own distribution credentials;
they are not configured in this project.

Desktop PR loading requires Git on PATH. The app clones the fixed
`https://github.com/kubernetes/website.git` remote into `checkouts/pr-<number>/`
under the OS application cache, with English content, the selected translation
language, and static assets
checked out. Clean cached checkouts are fetched and refreshed. Checkouts with
local edits retain their cached revision without refreshing. Your own working
copies are never switched or reset.

**Save translation** writes only existing Markdown files under the
app-managed checkout's `content/<language>/` directory. English stays read-only.
Saves use a temporary file and
atomic replacement, preserve file permissions, and refuse to overwrite files
whose contents changed outside the app. Export your draft before reopening a
repository after a conflict. Export controls use native save dialogs.

## Configure LLM review

Open **Settings** using the gear button. The defaults are Ollama, model
`qwen3.8:27b-q4_K_M`, and endpoint `http://127.0.0.1:11434`. Other choices include
OpenAI, Anthropic, Google Gemini, and OpenAI-compatible endpoints such as a
LiteLLM Proxy.

LLM reviews use the TypeScript AI SDK in both browser development and desktop
mode. No Python setup is needed, and the packaged desktop app does not require
an installed Node.js runtime. Ollama must support its OpenAI-compatible
`/v1/chat/completions` API.

Install and start [Ollama](https://ollama.com), then download the default
model:

```sh
ollama pull qwen3.8:27b-q4_K_M
```

This quality-oriented multilingual default targets a Mac mini M4 with 64 GB
of unified memory and explicitly selects GGUF Q4_K_M. Leave concurrency at one;
context and runtime need additional memory beyond the model weights. You can edit the model
for other hardware or faster reviews. Existing saved model choices are unchanged.

Use **Test connection** to verify the configured endpoint and model. Select
**Review with LLM** to review the current English/translation document pair. This
runs the enabled tasks configured under **Settings > Review Tasks**. No
document is sent automatically on load or while typing. Remote-provider
reviews require confirmation before document submission. Connection tests
send only a short probe.

Provider settings are saved locally, but API keys stay in memory for the
current session. You can also set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
`GEMINI_API_KEY` in the environment used to launch the server or desktop app.
Gemini also accepts `GOOGLE_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`.
An entered key takes precedence. Keys are not passed in command arguments or
written to log output. Remote Ollama endpoints may use HTTP; other
non-local provider endpoints must use HTTPS. Remote Ollama traffic over HTTP is
unencrypted, so use a trusted network or HTTPS when available.

LLM findings are marked **LLM**, have validated source locations, and appear
alongside offline findings in the review panel. Edits or configuration changes
invalidate previous LLM findings. The model receives no tools and cannot
modify files. The pair is limited to 100,000 characters; the selected model
must also support the supplied context. Requests time out after three minutes.

## Review tasks

The default LLM tasks are translation accuracy, content completeness, Spanish
grammar, terminology, technical fidelity, and Markdown/metadata. Each task
makes a separate AI SDK request using the configured provider and model.
Built-in tasks follow the active translation language. Custom instructions are
preserved; adjust language-specific custom prompts in Settings as needed.
History-backed Spanish editorial checks run only on Spanish documents.

Under **Settings > Review Tasks**, enable or disable tasks, edit their names
and instructions, or add and remove custom tasks. Task definitions are saved
locally alongside provider preferences. Existing provider settings
automatically receive the default tasks. Untouched legacy prompts receive the
history-backed rubric updates; custom prompts are retained. Up to 20 tasks
can be configured.

The **Parallel task limit** accepts 1 through 4. It defaults to 1 for local
Ollama workloads. Higher values submit independent tasks concurrently; the
provider may still queue requests internally. Multiple tasks increase token
usage and can incur separate provider charges.

Expand **Review Tasks** above the findings to run an individual task. The
panel reports queued, running, succeeded, and failed states independently. A
failed task does not discard successful findings or stop other tasks. Retry
it using its run button without rerunning successful tasks. **Review with
LLM** starts a fresh run of all enabled tasks.

Findings retain task names and distinct identifiers even when tasks flag the
same document line. The task panel shows per-task status and any failure
messages. Changing the document or task configuration invalidates prior
results.

## Review checks

- Resolve internal Markdown links against loaded files and static asset paths.
- Check local heading anchors and explicit `{#id}` or HTML IDs.
- Resolve reference-style links and basic quoted Hugo `ref`/`relref` shortcodes.
- Compare heading and paragraph counts without treating translated wording as
  proof of a missing section.
- Compare fenced code samples and locate possibly untranslated prose.
- Validate YAML frontmatter and inspect changes to rendering metadata.
- Preserve explicit source IDs and Hugo heading/glossary/include contracts.
- Check shortcode block closures and adjacent duplicated paragraphs.
- Jump from a finding to its editor location.

The [Spanish review coverage audit](spanish-review-coverage.md) maps historical
reviewer suggestions to deterministic checks, LLM tasks, and explicit
manual-review boundaries.

## Published references

Select **Check references** to verify the current document pair's Kubernetes
documentation references against the published site. This is deterministic
HTTP checking, independent of the LLM provider. Absolute
`https://kubernetes.io/docs/...` links, localized documentation paths, and
relative references resolving to these paths are supported. Other hosts are
not contacted.

The checker makes a GET request and stops reading after the response headers.
Duplicate page URLs are checked once per run, with at most four concurrent
requests and 100 distinct pages per document pair. Each check has a 15-second
deadline and follows up to five redirects, only within Kubernetes
documentation. The development bridge honors configured HTTP(S) proxy and
bypass variables. Native checks use the system environment's proxy
configuration. TLS verification stays enabled.

HTTP 404 and 410 responses produce missing-page findings with a **Create
issue** action. It opens a new `kubernetes/website` GitHub issue draft with
the target URL, source file and line, source excerpt, PR context when
available, and timestamped HTTP evidence. Review and submit the draft yourself
in GitHub; the app does not post issues or require a GitHub token.

Timeouts, blocked requests, rate limits, server errors, and disallowed
redirects remain informational and do not offer the issue action. Successful
HTTP responses establish page availability only. Published anchor fragments
and soft-404 pages returning HTTP 200 are not verified. Editing a document
invalidates its previous published-reference findings.

## Alignment and limitations

Shared explicit heading IDs, inline-code heading tokens, and identical
headings anchor alignment. Equal-sized gaps use heading depth and position as
a tentative pairing. Synchronized scrolling interpolates between those
heading pairs; it is not semantic paragraph matching.

Offline checks do not assess translation accuracy or grammar. LLM suggestions
can assess these areas but still require human verification. Paragraph and
code differences can be intentional and require human review. External URLs
are counted during offline checks. Only explicit published-reference checking
contacts Kubernetes documentation. If GitHub returns a truncated repository
tree, missing targets are informational rather than confirmed broken links.

Heading slug generation approximates Hugo using GitHub-style slugs. Hugo
aliases, custom permalinks, generated pages, complex shortcodes, and runtime
templates are not fully resolved. Verify suspicious anchor findings against
the rendered site. Only English and the selected language's Markdown contents are loaded;
other files are indexed by path.

Repository loading is limited to 50,000 indexed files, 100 MB of Markdown,
and 4 MB per document. The native loader skips symlinks and hidden paths.
Documents are parsed as data and never executed or rendered as HTML. No
telemetry is included. Optional LLM review sends the current document pair to
your configured provider.

The Kubernetes logo is from the
[Kubernetes repository](https://github.com/kubernetes/kubernetes/tree/master/logo).

## Next steps

- Check the [configuration reference](references/configuration.md) for runtime defaults.
- Read [how review works](explanations/how-review-works.md) for architecture and trust boundaries.
- Use the [manual review checklist](spanish-review-coverage.md#manual-review-checklist)
  before posting findings or approving a contribution.
