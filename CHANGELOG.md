<!-- Markdownlint-disable MD024 -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
