---
title: Troubleshooting
parent: How-to guides
nav_order: 2
---

# Troubleshooting

Use this guide to recover a local review session.
Download any edited translation before reloading, replacing a workspace,
or reopening a checkout.

## The development server cannot start on port 5173

The browser and desktop development workflows use the same fixed port.
Stop the development server you previously started with `Ctrl+C`,
then run either `npm run dev` or `npm run desktop`, not both.
Do not stop an unrelated process that you do not own.

## The pull request list is empty or fails to load

Confirm the selected translation language and use **Refresh pull requests**.
The list contains open `kubernetes/website` pull requests with that language's label;
not every language has an open pull request.

For network or GitHub API failures, check your connection and any rate-limit message,
then retry after the limit resets.
The browser loader uses GitHub's public API.
Desktop loading additionally needs Git on `PATH`.

If a selected pull request contains no added or modified Markdown in the selected language,
choose another pull request.

## LLM review cannot start Python

1. Install Python 3.10 or newer.
2. Follow the
   [Python environment setup](https://github.com/electrocucaracha/k8s-docs-review-app/blob/main/CONTRIBUTING.md#python-environment)
   to install the project's requirements.
3. In **Settings > Python Runtime > Python executable**,
   select the interpreter from that environment.
4. Retry **Test connection**.

In local development, the project `.venv` is discovered automatically.
A packaged desktop app bundles the helper script, not Python or LiteLLM.
`K8S_DOCS_REVIEW_PYTHON` is an alternative to selecting an interpreter in Settings.

## The provider connection fails or a task times out

Check the provider, model, endpoint, and credentials in Settings.
For the default Ollama setup, start Ollama and run:

```sh
ollama pull llama3.2
```

Use **Test connection** before submitting a document.
API keys are session-only and must be entered again after restarting the app,
unless the Python helper obtains them from the provider's environment variables.

For a local model under memory or processing pressure,
set **Parallel task limit** to `1`.
Reduce enabled tasks if necessary.
Each request has a three-minute timeout.
Retry a failed task from **Review Tasks** without rerunning successful tasks.

For document-size failures, the pair is limited to 100,000 characters;
the model also needs enough context capacity.
See [configuration limits](../references/configuration.md#limits).

## Published-reference checking does not offer Create issue

Only HTTP 404 and 410 results support a missing-page issue draft.
Timeouts, rate limits, blocked requests, server errors, and disallowed redirects
do not prove a page is missing.
Check the reported URL in a browser and retry later if appropriate.

A successful page request does not verify a fragment such as `#before-you-begin`,
or detect a soft-404 page returning HTTP 200.
See [published-reference behavior](../user-guide.md#published-references).

## A desktop save reports an external change

Export the current draft first.
Compare it with the app-managed checkout's file,
then reopen the repository and reapply the intended changes.
The save guard refuses to overwrite a file changed outside the app.
Do not delete the checkout to resolve a conflict before preserving your draft.

Checkouts with local edits retain their cached pull request revision rather than refreshing.
Compare the review revision with the current pull request head before posting findings.

## A link finding disagrees with the rendered website

Check the actual Hugo or Netlify preview at the pull request head revision.
Aliases, generated pages, complex shortcodes, and custom permalinks
are not fully resolved by offline checks.
Cross-file fragments without loaded target Markdown remain unchecked.

See [how review works](../explanations/how-review-works.md)
for the distinction between findings and proof of correctness.

## Report a reproducible problem

Open a [project issue](https://github.com/electrocucaracha/k8s-docs-review-app/issues)
with the operating system, browser or desktop mode, relevant error,
pull request URL, and steps to reproduce.
For provider failures, include the provider and model, but remove API keys,
private endpoints, and sensitive document content.
