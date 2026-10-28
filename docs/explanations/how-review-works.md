---
title: How review works
parent: Explanations
nav_order: 1
---

# How review works

A useful translation review needs both mechanical evidence and human judgement.
This app separates local checks, optional AI suggestions,
and published-page availability so that one layer's success does not imply another's.

## One workspace, two runtimes

The React interface and CodeMirror editors compare the English source
with the selected translation.
English remains read-only.
The same TypeScript review engine runs in browser and desktop modes.

```text
Browser development
  React interface -> GitHub public API -> PR files at a pinned head revision
                  -> local Markdown checks
                  -> Vite bridge / TypeScript AI SDK -> configured provider
                  -> Vite bridge -> published Kubernetes documentation

Desktop
  React interface -> Tauri / Rust -> app-managed Git checkout
                                 -> published Kubernetes documentation
                  -> TypeScript AI SDK -> Tauri HTTP transport -> configured provider
```

In browser mode, files and drafts live in memory.
The Vite development server supplies the local HTTP bridges
for LLM review and published-reference checking.
Those bridges are not part of the static production build.

In desktop mode, Rust commands manage a checkout in the operating system's application cache.
The app uses the fixed `kubernetes/website` remote,
not a user-selected local repository.
Clean cached checkouts refresh; locally edited checkouts retain their revision.
Save guards protect against path escapes and external file changes.

This is why GitHub Pages hosts the documentation rather than the complete review service:
Pages cannot run the backend, run Git, or provide the local bridges.

## Source map

The main implementation boundaries are:

| Area                     | Files                                                                                    | Responsibility                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Application workflow     | `src/App.tsx`                                                                            | Workspace state, pull request selection, editors, findings, settings, and save/export actions.              |
| Markdown review          | `src/review.ts`                                                                          | Markdown parsing, link and anchor resolution, section alignment, and deterministic findings.                |
| Spanish editorial checks | `src/editorialChecks.ts`                                                                 | History-backed Spanish-specific checks used by the shared review engine.                                    |
| GitHub pull requests     | `src/pullRequest.ts`                                                                     | Language and pull request discovery, revision-pinned file loading, commit comparisons, and browser caching. |
| AI settings and requests | `src/llm.ts`, `src/reviewTasks.ts`, `src/llmReview.ts`                                   | Settings persistence, task scheduling, provider requests, prompt construction, and result validation.       |
| Browser bridges          | `llm/bridge.ts`, `server/publishedReferences.ts`                                         | Same-origin development-server routes for AI review and published-page checks.                              |
| Published references     | `src/publishedReferences.ts`, `src/documentationUrl.ts`                                  | URL collection, request orchestration, result classification, and GitHub issue drafts.                      |
| Desktop runtime          | `src-tauri/src/main.rs`, `src-tauri/src/llm.rs`, `src-tauri/src/published_references.rs` | Tauri commands, managed Git checkouts, safe saves and exports, and restricted native HTTP requests.         |
| Verification             | `tests/review.test.ts`, `tests/llm.test.ts`, `tests/app.spec.ts`, Rust unit tests        | Review and provider unit tests, browser workflows, and native filesystem/transport checks.                  |

The React interface calls the shared TypeScript review functions in either runtime.
Only operations that need a server or operating-system capability cross a bridge:
the Vite middleware handles them in browser development, while Tauri commands handle them on desktop.
The static documentation site does not bundle either bridge.

## Review request flow

When you select a document, the app pairs its translation with the English path
and runs `reviewDocuments` locally. That function parses Markdown and returns
findings and tentative section alignments; it does not call GitHub or an AI provider.
The browser loader pins pull request documents to the selected head commit,
so both sides of the comparison come from a known revision.

When you explicitly start an AI review, the app runs each enabled review task
through the TypeScript AI SDK. Large pairs are divided into heading-aligned excerpts.
The Vite bridge handles provider requests in browser development; desktop sends
the same SDK requests through the restricted Rust transport.
Both paths validate settings and response findings.

Published-reference checks are a separate explicit action.
The app only sends supported Kubernetes documentation URLs to its bridge,
which follows a bounded redirect chain and returns status information.
The check establishes page availability, not anchor or content correctness.

## Mechanical differences are evidence, not verdicts

Offline checks parse Markdown and compare structure, references, code, and metadata.
For example, a translated command changing `--replicas=2` to `--replicas=3`
is an observable difference.
It may be an error or an intentional example change; a reviewer decides.

Similarly, unequal paragraph counts do not prove missing content.
Translations can merge or split paragraphs.
Heading alignment uses explicit IDs, shared code tokens,
and positional fallbacks rather than semantic paragraph matching.
Synchronized scrolling follows those tentative pairs.

Link checks use the repository index and loaded Markdown.
They do not build Hugo.
Generated pages, aliases, custom permalinks, and complex shortcodes
can differ from the offline approximation.
A truncated GitHub tree produces informational missing-target results,
not confirmed broken links.

## AI review answers a different question

The TypeScript AI SDK uses provider adapters to send the current pair
to the provider selected in Settings.
Independent tasks focus on different concerns such as meaning, completeness, or grammar.
For pull requests, inline review comments appear beside their referenced lines.
The explorer's **PR comments** section shows collapsible, Markdown-rendered
conversation comments.
Inline comments on the current file are also provided to the model as context, so
suggestions already addressed in the documents are not repeated. Comments are
untrusted input; the model should judge the current text rather than treat a comment
as authoritative.
The model has no tools and cannot edit files.
Returned findings have validated categories and source locations.
Desktop requests use a restricted Rust HTTP transport to avoid browser CORS
without installing Python or Node.js. Browser development makes provider
requests from the Vite server. Both paths use the same prompts and validators.

Valid output structure does not make a suggestion true.
A model may propose a subjective rewrite or misunderstand Kubernetes behavior.
The English revision is the evidence available to the task,
not proof that the underlying documentation matches the latest release.
Human review remains necessary before applying or posting a suggestion.

## Published availability is narrower than link correctness

An explicit published-reference check requests Kubernetes documentation pages.
HTTP 404 and 410 responses support missing-page findings and issue drafts.
Rate limits and network failures remain informational.

An HTTP 200 response only shows that a page responded successfully.
It does not establish that a fragment exists,
that the response is not a soft 404,
or that the linked text is relevant.
The app opens an issue draft; it does not submit an issue.

## A clean panel is not an approval

The app reviews complete changed documents,
not only changed lines or previously unreviewed discussion.
It does not verify contribution agreements, required checks, authorized approvals,
preview freshness, or every commit.
It also does not execute Kubernetes commands or render the site.

The [Spanish review history coverage](../spanish-review-coverage.md)
records the evidence behind Spanish-specific checks and prompts,
with explicit boundaries for manual review.
The historical audit is a dated snapshot, not a guarantee of future coverage.

## Related documentation

- [Review a pull request](../user-guide.md).
- [Extend the reviewer](../how-to-guides/extending-the-reviewer.md).
- [Settings and limits](../references/configuration.md).
- [Troubleshoot unexpected findings](../how-to-guides/troubleshooting.md).
