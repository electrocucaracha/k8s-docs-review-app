<!-- Markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.2.0] - 2026-10-28

### Added

- Enabled users to build and verify rendered links and anchors in the PR checkout by integrating a Hugo build and link checker, exposing a Tauri command and displaying findings for missing or broken links. [405a8cf9](https://github.com/electrocucaracha/k8s-docs-review-app/commit/405a8cf975dd2896b7f0db1f8a81955e7c5ac810)

## [6.1.0] - 2026-10-28

### Added

- Enabled the integration of Hugo build checks for users to verify rendered links and anchors, and updated documentation to reflect the new feature, including usage guidelines, troubleshooting, and configuration defaults. [bb5f6a11](https://github.com/electrocucaracha/k8s-docs-review-app/commit/bb5f6a1119ec116b3ece4af23f6dc0c10931dc3b)

## [6.0.0] - 2026-10-27

### Removed

- Streamlined the documentation by removing maintenance-heavy or redundant guides and improving navigation structure. [df5d07d9](https://github.com/electrocucaracha/k8s-docs-review-app/commit/df5d07d99a1b935284e01fe12710c9011d2f20e5)

## [5.2.0] - 2026-10-27

### Added

- Enabled better visualization of the app's functionality with the addition of a diagram image to the readme. [d8f95a79](https://github.com/electrocucaracha/k8s-docs-review-app/commit/d8f95a79bf3a508df93e32f2831c52696731e394)

## [5.1.2] - 2026-10-27

### Changed

- Enabled contributors to extend core functionality by introducing a new extension guide and architecture diagram that provide implementation boundaries and request flow, as well as detailed instructions on adding checks, AI tasks, providers, or runtime features. [b9156c0b](https://github.com/electrocucaracha/k8s-docs-review-app/commit/b9156c0b5fc5830c609e9ddd6124b8a45b2d25d9)

## [5.1.1] - 2026-10-26

### Fixed

- Resolved environment variable lookup for LLM providers to safely allow repeated lookups and avoid ownership issues, improving code correctness and maintainability without introducing any breaking changes or requiring migration steps. [d74c048e](https://github.com/electrocucaracha/k8s-docs-review-app/commit/d74c048ed65120d9c789a5116e4adefaf81988f7)

## [5.1.0] - 2026-10-26

### Added

- Enabled detailed release notes for versions 4.9.0 through 5.0.3, improving project traceability and providing clear context to contributors about recent development history without introducing any functional changes to the code. [e82427d9](https://github.com/electrocucaracha/k8s-docs-review-app/commit/e82427d9a017c3bd72b8e70d2c3217b0e97397df)

## [5.0.3] - 2026-10-26

### Changed

- Modernized the codebase to improve readability and consistency, with Rust code now formatted vertically for long function parameters and blocks, and CSS files updated with modern media query syntax and improved spacing, enhancing maintainability without altering functional behavior. [d2f547dc](https://github.com/electrocucaracha/k8s-docs-review-app/commit/d2f547dc31a393d6059744c03b125fb9f28bc775)

## [5.0.2] - 2026-10-26

### Changed

- Enabled standardized development tooling and code quality enforcement by introducing configuration files for spelling checks, editor settings, code duplication thresholds, type checking, formatting exclusions, and CSS linter rules, and updating guidelines in CONTRIBUTING.md. [ca66cba7](https://github.com/electrocucaracha/k8s-docs-review-app/commit/ca66cba79563fd9536ecfe3f94e20f79546a36c3)

## [5.0.1] - 2026-10-26

### Changed

- Clarified the functionality and intent of the audit_review_history.py script through the addition of descriptive docstrings and improved code formatting, without altering program logic. [650758f3](https://github.com/electrocucaracha/k8s-docs-review-app/commit/650758f3081ba6767cd35da98498aa487a9895cb)

## [5.0.0] - 2026-10-26

### Removed

- Standardized and expanded code linting and formatting across the project by delegating to the shared super-linter workflow with explicit override controls. [fd2662a0](https://github.com/electrocucaracha/k8s-docs-review-app/commit/fd2662a01826f200849609ddb7cd8eb0bb986a68)

## [4.12.0] - 2026-10-26

### Added

- Enabled effective vulnerability and misconfiguration scanning by introducing Trivy configuration that silences a glib vulnerability required by Tauri 2 on Linux, while allowing time for upstream resolution. [e0e4f57d](https://github.com/electrocucaracha/k8s-docs-review-app/commit/e0e4f57dded90f79aca43b62118c04e31519d278)

## [4.11.2] - 2026-10-26

### Changed

- Enabled consistent application code and native code quality checks on all pushes and pull requests through the introduction of a new GitHub Actions workflow. [14fb4df0](https://github.com/electrocucaracha/k8s-docs-review-app/commit/14fb4df003483d1a4f31095068cfd398d8ed86d4)

## [4.11.1] - 2026-10-26

### Changed

- Streamlined pre-commit linting by excluding generated files and upgrading the markdownlint hook to the node markdownlint-cli2 version. [da05dad7](https://github.com/electrocucaracha/k8s-docs-review-app/commit/da05dad71645ce557b5f56c26bc46914fa612677)

## [4.11.0] - 2026-10-25

### Added

- Optimized LLM review reliability by introducing retry logic that halves timed-out excerpts up to twice before reporting incomplete reviews, while also improving performance by limiting excerpt size for Ollama providers and disabling model reasoning, and enhancing error differentiation and structured logging for LLM requests and responses. [03bc33e3](https://github.com/electrocucaracha/k8s-docs-review-app/commit/03bc33e381e7ec579bff10f71128078680e22d8a)

## [4.10.0] - 2026-10-25

### Added

- Enabled filtering of pull requests to only include those with zero or one label whose name starts with "language/", reducing ambiguity in processing or categorization logic and resulting in fewer pull requests being displayed to users. [19ba7ed6](https://github.com/electrocucaracha/k8s-docs-review-app/commit/19ba7ed66e303717ecb0d1736602cc419bc000e8)

## [4.9.0] - 2026-10-25

### Added

- Enabled detailed release notes for versions 4.5.0 through 4.8.2, improving traceability and clarity for contributors by summarizing key changes, optimizations, and new features. [8099064f](https://github.com/electrocucaracha/k8s-docs-review-app/commit/8099064f9b289829998229fdd77b90222f007eba)

## [4.8.2] - 2026-10-25

### Changed

- Simplified the documentation by consistently using "empty lines" instead of "empty lines" to describe omitted lines in requests, with no impact on breaking behavior, API or CLI changes, or security. [648ca5e1](https://github.com/electrocucaracha/k8s-docs-review-app/commit/648ca5e1731aac22e0fc7274716fa8cc4d3b7601)

## [4.8.1] - 2026-10-25

### Changed

- Optimized large LLM review pairs for analysis by introducing heading-aligned excerpts of about 12,000 characters each, with independent deadlines and merged findings, improving clarity on review scaling, limits, and error handling for large documents. [6ae4c1a3](https://github.com/electrocucaracha/k8s-docs-review-app/commit/6ae4c1a3f5e879dac05c0d96b29bf995e7e8cc1e)

## [4.8.0] - 2026-10-25

### Added

- Enabled large document reviews to proceed by splitting content into heading-aligned excerpts when the provider's character limit is exceeded. [4cf5bd2a](https://github.com/electrocucaracha/k8s-docs-review-app/commit/4cf5bd2a25b564ded45d60d4b361e217468325fc)

## [4.7.0] - 2026-10-25

### Added

- Enabled a new npm script, "test:coverage", to measure code coverage locally without additional setup, allowing developers to run Node's built-in test coverage feature on review and LLM test files. [e5a607d2](https://github.com/electrocucaracha/k8s-docs-review-app/commit/e5a607d25fcfccfd7701cdff9f38254911492e73)

## [4.6.1] - 2026-10-25

### Changed

- Optimized code quality for TypeScript sources by enabling oxlint in the CI pipeline. [06d899e5](https://github.com/electrocucaracha/k8s-docs-review-app/commit/06d899e5187d288cfd9d61c0edd8c58f94804d43)

## [4.6.0] - 2026-10-25

### Added

- Enabled automatic updates for Node dependencies with the latest versions, ensuring all major dependency types are handled by the update script. [a833ebdd](https://github.com/electrocucaracha/k8s-docs-review-app/commit/a833ebddb28ab3bab7013ddc16eb6afc562054ae)

## [4.5.1] - 2026-10-25

### Changed

- Updated the ai-prepare-commit-msg pre-commit hook to v20.6.0 to ensure compatibility with recent features and benefit from upstream maintenance, including the latest improvements and fixes. [8be909c8](https://github.com/electrocucaracha/k8s-docs-review-app/commit/8be909c844860d435c0d9c5123d5357d0b1f1cb7)

## [4.5.0] - 2026-10-25

### Added

- Updated the changelog with detailed release notes for versions 2.1.0 through 4.4.0, providing improved traceability and clarity for contributors and better release management. [224c7771](https://github.com/electrocucaracha/k8s-docs-review-app/commit/224c77711ff426f000780a17cca40e17cd1a0259)

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
