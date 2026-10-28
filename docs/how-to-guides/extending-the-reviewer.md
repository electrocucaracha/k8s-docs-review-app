---
title: Extend the reviewer
parent: How-to guides
nav_order: 4
---

# Extend the reviewer

Use this guide to add a deterministic check, change the built-in AI rubric,
support another AI provider, or extend a browser or desktop workflow.
The [architecture explanation](../explanations/how-review-works.md)
describes the runtime boundaries and source map.

## Set up the project

Install Node.js 22.12 or newer and npm.
Clone the repository, install its locked dependencies, and start the browser app:

```sh
git clone https://github.com/electrocucaracha/k8s-docs-review-app.git
cd k8s-docs-review-app
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` to try changes against the example workspace.
The app's [first-review tutorial](../tutorials/first-review.md)
walks through the example workflow.
Desktop changes also require Rust, Git, and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

## Choose the extension point

| Change                            | Implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Focused verification                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add an offline Markdown finding   | [`src/review.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/review.ts); Spanish history-backed rules belong in [`src/editorialChecks.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/editorialChecks.ts).                                                                                                                                                                                                                     | [`tests/review.test.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/tests/review.test.ts)                                                                                                                              |
| Add or revise a built-in AI task  | [`src/reviewTasks.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/reviewTasks.ts).                                                                                                                                                                                                                                                                                                                                                                        | [`tests/review.test.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/tests/review.test.ts) and [`tests/llm.test.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/tests/llm.test.ts)               |
| Add an AI provider                | [`src/llm.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/llm.ts), [`src/llmReview.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/llmReview.ts), and [`src/SettingsDialog.tsx`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/SettingsDialog.tsx); desktop environment access is in [`src-tauri/src/llm.rs`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src-tauri/src/llm.rs). | [`tests/llm.test.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/tests/llm.test.ts), [`tests/app.spec.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/tests/app.spec.ts), and native Rust tests |
| Add a published-reference rule    | [`src/publishedReferences.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/publishedReferences.ts), [`src/documentationUrl.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/documentationUrl.ts), and both runtime bridges.                                                                                                                                                                                                      | Review tests, browser tests, and native Rust tests                                                                                                                                                                                            |
| Change a user workflow or control | [`src/App.tsx`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/src/App.tsx), its related component, and the corresponding styles.                                                                                                                                                                                                                                                                                                                                 | [`tests/app.spec.ts`](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/tests/app.spec.ts)                                                                                                                                    |

## Add a deterministic check

The shared review engine parses Markdown with `parseDocument` and creates
findings in `reviewDocuments`.
Keep offline checks local and deterministic:
they should not submit document content to a provider or fetch arbitrary URLs.
Use the parsed headings, links, code blocks, frontmatter, and shortcode data
when they provide the needed signal.

Each finding needs a stable `kind`, `severity`, `side`, one-based `line`,
short `title`, and actionable `detail`.
Account for incomplete workspaces: a target that was not loaded is not always
evidence that a repository link is broken.
For Spanish-only historical rules, add logic to `editorialChecks.ts`
instead of coupling the general review engine to Spanish content.

Add a focused case to `tests/review.test.ts` that proves the finding appears
for the problematic input and does not appear for a valid or intentionally
different input.
When practical, test that the reported line points to the source text.

## Change an AI review task

Users can add custom tasks in Settings without a code change.
For a task that should be available by default, update `defaultTasks` in
`src/reviewTasks.ts` with a unique ID, concise name, and bounded instructions.
Built-in instructions must work for every supported translation language;
avoid hardcoding Spanish-only criteria into a general task.

Saved task instructions are user data.
When revising a built-in task, preserve customized instructions and update
the task migration only when an older default must be upgraded.
Add tests for both the new behavior and migration preservation.
The [configuration reference](../references/configuration.md#review-tasks)
documents task limits and persistence.

## Add an AI provider

The AI SDK routes requests from `src/llmReview.ts`.
Adding a provider typically requires changes to the `Provider` type,
provider defaults and settings validation in `src/llm.ts`,
and the selector in `src/SettingsDialog.tsx`.
Add the provider's model construction and environment-key selection in
`src/llmReview.ts`.
For desktop use, expose only the required environment variable names through
`llm_environment` in `src-tauri/src/llm.rs`.

Keep browser and desktop behavior aligned.
The TypeScript SDK uses the Vite development bridge in browser mode
and the restricted Rust HTTP transport in desktop mode.
Do not add a separate provider implementation to the Rust transport;
it forwards the SDK request.
Preserve endpoint validation, HTTPS requirements for remote providers,
request and response size limits, timeouts, redirect rejection,
and the rule that credentials are not persisted or logged.

Add provider routing and response-schema cases to `tests/llm.test.ts`,
Settings workflow coverage to `tests/app.spec.ts`,
and native transport tests if the allowed headers or endpoint rules change.
Use a local HTTP fixture rather than live credentials in tests.

## Extend a runtime workflow

Browser-only server operations belong in the Vite plugins in `llm/bridge.ts`
or `server/publishedReferences.ts`.
The desktop equivalent belongs in a Tauri command registered in
`src-tauri/src/main.rs` and implemented in Rust.
When an operation is available in both runtimes, update both paths and test
their shared behavior.

Published-reference checks use a particularly strict boundary:
validate URLs with `documentationUrl.ts` before requesting them,
and keep redirects within Kubernetes documentation.
Do not broaden the request target to arbitrary hosts.
Keep network actions explicit in the UI and represent unavailable evidence
as informational rather than as a confirmed defect.

## Run checks before submitting

Run the TypeScript tests, lint, and production build after source changes:

```sh
npm test
npm run lint
npm run build
```

For browser workflow changes, install the Playwright browser once and run:

```sh
npx playwright install chromium
npm run test:ui
```

For native changes, run Rust tests on a machine with Tauri prerequisites:

```sh
cargo test --manifest-path src-tauri/Cargo.toml
```

Update the user guide, configuration reference, or architecture explanation
when observable behavior, defaults, limits, or trust boundaries change.
Use the [contribution guide](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/CONTRIBUTING.md)
for formatting, CI details, and documentation build instructions.
