---
title: Publish to GitHub Pages
parent: How-to guides
nav_order: 3
---

# Publish to GitHub Pages

This guide publishes the documentation, not the review application.
It uses Jekyll and the Just the Docs theme,
following the documentation structure of
[AI Prepare Commit Message](https://github.com/electrocucaracha/ai-prepare-commit-msg/tree/main/docs).

## Prerequisites

- Repository administration access to select the Pages source.
- GitHub Actions enabled for the repository.
- Ruby 3.3 and Bundler for local previews.
  Application development does not otherwise require Ruby.

## Preview locally

From the project root:

```sh
cd docs
bundle install
bundle exec jekyll serve --host 127.0.0.1 --baseurl ""
```

Open <http://127.0.0.1:4000>.
Search, navigation, and code-copy controls are supplied by the theme.
Stop the preview with `Ctrl+C`.

For a production-style build with the configured project subpath:

```sh
bundle exec jekyll build --strict_front_matter --trace
```

The generated site is in `docs/_site/` relative to the project root.
Generated files are ignored and must not be committed.
The theme and build dependencies are defined in `docs/Gemfile`
and resolved in `docs/Gemfile.lock`.

## Enable publishing

1. Push the documentation and `.github/workflows/docs.yml` to the repository's `main` branch.
2. Open **Settings > Pages** in GitHub.
3. Under **Build and deployment > Source**, select **GitHub Actions**.
4. Open **Actions > Documentation** and select **Run workflow** on `main`.
5. Confirm both the build and deploy jobs succeed.
6. Open the URL reported by the `github-pages` deployment environment.

For this repository, the expected URL is
<https://electrocucaracha.github.io/k8s-docs-review-app/>.
It becomes available after the first successful deployment.
If your organization requires environment approval,
approve the `github-pages` deployment in GitHub.

Documentation pull requests build the site but do not deploy it.
Pushes to `main` that change documentation or its workflow build and deploy automatically.
The workflow grants Pages write access and an identity token only to the deployment job.

## Publish from a fork or custom domain

Update these values in `docs/_config.yml` before publishing:

| Value       | Project Pages example            |
| ----------- | -------------------------------- |
| `url`       | `https://YOUR-ACCOUNT.github.io` |
| `baseurl`   | `/YOUR-REPOSITORY`               |
| `aux_links` | Your repository URL              |

For an account site or a custom domain served at the root, set `baseurl: ""`.
Configure a custom domain in GitHub's Pages settings and your DNS provider.
Update repository links in the documentation when publishing a fork.
If your default branch is not `main`,
update both the push branch and deploy condition in the workflow.

## Add or update a page

1. Edit Markdown under `docs/`.
2. Use sentence-case headings and semantic line breaks.
3. Add frontmatter with a `title`, `parent`, and `nav_order`
   matching one of the existing section titles.
4. Link to the page from its section index and to related next steps.
5. Preview and run the production-style build before opening a pull request.

For example, a how-to page can start with:

```yaml
---
title: Check a translation
parent: How-to guides
nav_order: 4
---
```

Use relative Markdown links between documentation pages.
The `jekyll-relative-links` plugin rewrites them to generated page URLs,
including the configured project subpath.
Use absolute GitHub URLs for files outside `docs/`;
they are not included in the published site.
Keep existing public guide paths and heading anchors stable.

## Resolve publishing failures

- **Ruby or Bundler fails locally:** use Ruby 3.3, matching the workflow,
  rather than macOS's system Ruby.
- **The build reports a frontmatter error:** check the changed page's YAML delimiters and indentation.
- **Deploy reports that Pages is unavailable:** select **GitHub Actions** as the Pages source
  and check repository or organization Pages permissions.
- **Styles or navigation return 404:** check `url` and `baseurl`,
  then rebuild; do not add the project path manually to every link.
- **A deployment waits for approval:** check the `github-pages` environment's protection rules.

For application issues, use [Troubleshooting](how-to-guides/troubleshooting.md).
