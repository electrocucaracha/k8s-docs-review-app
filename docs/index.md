---
title: Home
nav_order: 1
---

# Kubernetes Docs Review

Review a Kubernetes documentation translation alongside its English source,
find broken references and structural differences,
and export a corrected Markdown draft.
Optional AI review helps you assess meaning, grammar, and technical fidelity.

This is an independent review tool, not an official Kubernetes project.

## Start with a local review

Install Node.js 22.12 or newer and npm.
From a project checkout, run:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`.
The app opens an **Example workspace** with intentional translation problems.
You do not need Python, an API key, or an Azure account to use the offline checks.

Follow the [user guide](how-to-guides/user-guide.md)
to load a pull request and review its translations.

## Choose your next task

| Your goal                                          | Start here                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Load a real pull request and edit its translations | [User guide](how-to-guides/user-guide.md#load-a-pull-request)        |
| Run a desktop app that can save drafts locally     | [Desktop workflow](how-to-guides/user-guide.md#run-as-a-desktop-app) |
| Configure optional AI review                       | [LLM setup](how-to-guides/user-guide.md#configure-llm-review)        |
| Look up defaults and limits                        | [Configuration reference](references/configuration.md)               |
| Understand what the checks can and cannot prove    | [How review works](explanations/how-review-works.md)                 |
| Add a check, AI task, provider, or runtime feature | [Extend the reviewer](how-to-guides/extending-the-reviewer.md)       |
| Fix a loading, runtime, or save problem            | [Troubleshooting](how-to-guides/troubleshooting.md)                  |

## Browser or desktop?

Both modes compare English and translated Markdown and run offline checks.
The browser development server downloads public pull request files
and keeps edits in memory until you download them.
The desktop app uses an app-managed Git checkout and can save translations there.
Neither mode changes your own Kubernetes site working copy.

The GitHub Pages site hosts **documentation, not the review app**.
Large language model (LLM) review and published-reference checks need the local
development server or desktop runtime.
Uploading the app's static build to Pages does not provide those services.

## Documentation map

- [How-to guides](how-to-guides/index.md): review and recovery tasks.
- [Reference](references/index.md): provider settings and limits.
- [Explanations](explanations/index.md): review design and human-review boundaries.
