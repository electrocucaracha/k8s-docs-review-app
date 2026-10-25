# SPDX-license-identifier: Apache-2.0
##############################################################################
# Copyright (c) 2026
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Apache License, Version 2.0
# which accompanies this distribution, and is available at
# http://www.apache.org/licenses/LICENSE-2.0
##############################################################################

.PHONY: cleanup
cleanup:
	rm -rf node_modules

.PHONY: fmt
fmt: cleanup
	command -v textlint > /dev/null && npm list --global --depth=0 textlint-rule-terminology > /dev/null 2>&1 || sudo npm install --global textlint textlint-rule-terminology
	textlint . --fix
	command -v shfmt > /dev/null || curl -s "https://i.jpillora.com/mvdan/sh!!?as=shfmt" | bash
	shfmt -l -w -s -i 4 .
	command -v yamlfmt > /dev/null || curl -s "https://i.jpillora.com/google/yamlfmt!!" | bash
	yamlfmt -dstar **/*.{yaml,yml}
	npx -y prettier . --write
	npx -y markdownlint-cli2 --fix .
