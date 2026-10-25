<!-- Markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.4.0] - 2026-10-25

### Added

- Enabled clear and consistent automation workflows for the repository by introducing a centralized documentation system that explains the purpose, triggers, and connections for linter, update, and release workflows, along with a diagram and summary table. [c3d82ce7](https://github.com/electrocucaracha/k8s-docs-review-app/commit/c3d82ce7c91816d8dfdaa9463c5a50ad99f770eb)

## [4.3.0] - 2026-10-25

### Added

- Automated release processes have been streamlined with the introduction of an AI-powered workflow that generates changelogs and can be triggered manually. [0a76b582](https://github.com/electrocucaracha/k8s-docs-review-app/commit/0a76b582c7b08ff13236c8b1dcf0ddffd9b90221)

## [4.2.0] - 2026-10-25

### Added

- Enabled standardized linting across CI and local development by introducing a GitHub Actions workflow and Makefile targets that run Super-Linter with overrides to disable Biome format and the prepare-commit hook. [e20cca2e](https://github.com/electrocucaracha/k8s-docs-review-app/commit/e20cca2e375361a84b19ef57075e1d5dafda2469)

## [4.1.0] - 2026-10-25

### Added

- Enabled project visibility with the addition of status badges in the readme, displaying license, code linting status, code style, visitor count, and code statistics for quick project status assessment by users and contributors. [8e1e06c2](https://github.com/electrocucaracha/k8s-docs-review-app/commit/8e1e06c20c2603c69255dc17030b2bf99387cbfa)

## [4.0.0] - 2026-10-25

### Removed

- Disabled automated documentation builds and GitHub Pages deployment, requiring users to handle documentation builds and deployment manually or through alternative means. [669f22fc](https://github.com/electrocucaracha/k8s-docs-review-app/commit/669f22fc732d253129bb6d27c3f35b3dd2962761)

## [3.0.0] - 2026-10-25

### Removed

- Streamlined the readme to focus on high-level project information by eliminating unnecessary instructions and documentation links. [a24941ad](https://github.com/electrocucaracha/k8s-docs-review-app/commit/a24941adfe775872a4e6fac7024a1753adf86b9e)

## [2.2.0] - 2026-10-25

### Added

- Enabled project sustainability by introducing support for GitHub Sponsors and Buy Me a Coffee funding links, allowing users to sponsor the project through a configurable funding mechanism. [875af921](https://github.com/electrocucaracha/k8s-docs-review-app/commit/875af921fcacb58a5e11564f200bbbecf55acf41)

## [2.1.4] - 2026-10-25

### Changed

- Automated scheduled updates of managed dependency version files are now enabled, ensuring dependencies remain current, and specific commit SHAs were pinned in the docs.yml file to improve security and build reproducibility. [f47e2cfe](https://github.com/electrocucaracha/k8s-docs-review-app/commit/f47e2cfe8b65589038219f14aebc99ad7ae755d6)

## [2.1.3] - 2026-10-25

### Changed

- Optimized project code and documentation formatting for clarity and consistency by introducing a Makefile with common linting and formatting targets and applying widespread formatting and alignment improvements. [541f40f7](https://github.com/electrocucaracha/k8s-docs-review-app/commit/541f40f78daf78c4d661693a1d657dff85a5f47e)

## [2.1.2] - 2026-10-25

### Changed

- Enabled enhanced linting for shell, Markdown, and YAML files, as well as spell checking, with updated pre-commit configuration and AI-prepare-commit hook settings, and updated the copyright year to 2026. [4456e755](https://github.com/electrocucaracha/k8s-docs-review-app/commit/4456e7552146e4e9f22b3c041779ce7f595eb8f8)

## [2.1.1] - 2026-10-24

### Changed

- Simplified the docs configuration by enabling the remote_theme setting and removing unnecessary options, aligning with modern Jekyll theme recommendations and reducing maintenance requirements. [6f66a84c](https://github.com/electrocucaracha/k8s-docs-review-app/commit/6f66a84c8f3314921995cb961a82d35b90b8accb)

## [2.1.0] - 2026-10-24

### Added

- Introduced a CHANGELOG.md file following the Keep a Changelog format to document notable changes across project releases, improving release management and discoverability of historical context for future contributors. [e081318a](https://github.com/electrocucaracha/k8s-docs-review-app/commit/e081318a16225b89cb7703ff8f79defb96b7ab10)

## [2.0.1] - 2026-10-24

### Changed

- Updated pre-commit hooks to version 6.0.0 to leverage the latest fixes and improvements for trailing-whitespace and end-of-file-fixer hooks. [0064f017](https://github.com/electrocucaracha/k8s-docs-review-app/commit/0064f0178e5c54271b5694a8915d8dafd37f5191)

## [2.0.0] - 2026-10-24

### Removed

- Migrated LLM review pipeline to rely entirely on the AI SDK in TypeScript, eliminating all Python-based review support and its associated scripts, requirements, and subprocess handling code. [19f88c00](https://github.com/electrocucaracha/k8s-docs-review-app/commit/19f88c001bd0cb756e7000a15cc2425b37b57ef4)

## [1.1.1] - 2026-10-24

### Changed

- Modernized the documentation to utilize the TypeScript AI SDK, enabling users to leverage the Ollama multilingual default model, qwen3.8:27b-q4_K_M, for quality-oriented review on modern Apple hardware, and eliminating the need for Python or Node.js in the packaged desktop app. [9a54188f](https://github.com/electrocucaracha/k8s-docs-review-app/commit/9a54188f70ba998a7abf79f170881bc5f5a6f5ce)

## [1.1.0] - 2026-10-24

### Added

- Enabled automated code quality checks and formatting throughout the project, enforcing coding standards and improving commit practices through a pre-commit configuration file with integrated linting and AI-powered commit message generation. [ce44a35f](https://github.com/electrocucaracha/k8s-docs-review-app/commit/ce44a35fcb907c42fef3060103d767612da907bf)

## [1.0.0] - 2026-10-24

### Added

- Enabled users to review Kubernetes documentation translations alongside the original English source, with optional AI review and published-reference checks, through a browser-accessible or desktop application. [db6e213c](https://github.com/electrocucaracha/k8s-docs-review-app/commit/db6e213c071027cf056c38d43f5f24a8a55de069)
