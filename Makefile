# SPDX-license-identifier: Apache-2.0
##############################################################################
# Copyright (c) 2026
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Apache License, Version 2.0
# which accompanies this distribution, and is available at
# http://www.apache.org/licenses/LICENSE-2.0
##############################################################################

DOCKER_CMD ?= $(shell which docker 2> /dev/null || which podman 2> /dev/null || echo docker)

.PHONY: cleanup
cleanup:
	rm -rf node_modules

# Keep the container settings aligned with .github/workflows/linter.yml.
.PHONY: lint
lint:
	sudo -E $(DOCKER_CMD) run --rm --platform linux/amd64 -v $$(pwd):/tmp/lint \
	-e RUN_LOCAL=true \
	-e LINTER_RULES_PATH=/ \
	-e VALIDATE_BIOME_FORMAT=false \
	-e VALIDATE_BIOME_LINT=false \
	-e VALIDATE_TYPESCRIPT_ES=false \
	-e VALIDATE_TSX=false \
	-e VALIDATE_PRE_COMMIT=false \
	-e VALIDATE_PYTHON_RUFF_FORMAT=false \
	-e VALIDATE_RUST_2015=false \
	-e VALIDATE_RUST_2018=false \
	-e VALIDATE_RUST_2024=false \
	-e VALIDATE_RUST_CLIPPY=false \
	-e MARKDOWN_CONFIG_FILE=.markdownlint.yml \
	-e MULTI_STATUS=false \
	-e DEFAULT_BRANCH=main \
	ghcr.io/super-linter/super-linter:v9.0.0

.PHONY: fmt
fmt:
	npx --no-install textlint --ignore-path .gitignore . --fix
	command -v shfmt > /dev/null || curl -s "https://i.jpillora.com/mvdan/sh!!?as=shfmt" | bash
	shfmt --apply-ignore -l -w .
	command -v yamlfmt > /dev/null || curl -s "https://i.jpillora.com/google/yamlfmt!!" | bash
	yamlfmt -gitignore_excludes .
	npx --no-install prettier . --write
	npx --no-install stylelint "src/**/*.css" --fix
	npx --no-install markdownlint-cli2 --fix "**/*.md" "#node_modules" "#src-tauri/target"
	uvx isort==9.0.1 --profile black scripts tests
	uvx black==26.10.1 scripts tests
	cargo fmt --manifest-path src-tauri/Cargo.toml
