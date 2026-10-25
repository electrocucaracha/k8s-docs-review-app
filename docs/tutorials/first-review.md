---
title: Review your first translation
parent: Tutorials
nav_order: 1
---

# Review your first translation

In this tutorial, we will correct a Spanish Markdown draft and download it.
The bundled example contains intentional errors, so no pull request is needed.
Allow about five minutes after installing dependencies.

## Before you begin

- Install [Node.js](https://nodejs.org/) 22.12 or newer, with npm.
- Install [Git](https://git-scm.com/downloads) to clone the project.
- Use a terminal and a browser.

Python, Ollama, and cloud credentials are not needed.
The checks run locally once the app loads;
initial dependency installation and the app's GitHub language and pull request lists use the network.

## 1. Start the workspace

Clone the project and start the browser development server:

```sh
git clone https://github.com/electrocucaracha/k8s-docs-review-app.git
cd k8s-docs-review-app
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>.
We should see **Example workspace**, an English source pane,
an editable Spanish translation pane, and **Review findings**.
Keep the terminal running.

## 2. Inspect a source difference

Open the Deployments document if it is not already selected.
In the English source, find:

```sh
kubectl create deployment nginx --image=nginx:1.25 --replicas=2
```

The Spanish translation has `--replicas=3` instead.
Select the corresponding code-difference finding to jump to the affected location.
Notice that English is read-only; we edit only the translation.

## 3. Correct the translation

Change `--replicas=3` to `--replicas=2` in the Spanish pane.
The offline findings update as we edit.
The fenced-code difference should disappear.

Next, find the Spanish link:

```markdown
[Estrategia de actualización](#actualizar-deployment)
```

Its destination does not match the heading's explicit ID, `update-deployment`.
Replace it with:

```markdown
[Estrategia de actualización](#update-deployment)
```

The local anchor finding should disappear too.
Other findings remain intentionally;
these two fixes do not establish that the whole translation is correct.

## 4. Download the draft

Select **Download Spanish translation** in the document toolbar.
Open the downloaded Markdown and confirm it contains `--replicas=2`
and the corrected `#update-deployment` destination.

Browser drafts remain in memory when switching files,
but do not survive closing or reloading the app.
Download your work before leaving the workspace.

We now have a corrected draft without sending document content to an AI provider.
Stop the development server with `Ctrl+C` when finished.

## Next steps

- [Load a real pull request](../user-guide.md#load-a-pull-request).
- [Configure LLM review](../user-guide.md#configure-llm-review).
- Read [how review works](../explanations/how-review-works.md)
  before interpreting a clean findings panel as an approval.
