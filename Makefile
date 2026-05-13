.PHONY: all test dev build build-server build-linux build-windows build-android clean lint lint-go lint-kt lint-py lint-html lint-actions lint-toml lint-makefile screenshot install-superhtml install-actionlint install-taplo install-checkmake install-tools

dev:
	bunx vite

build:
	bunx vite build
	rm -rf server/web
	cp -r dist server/web

build-server: build
	cd server && go build -ldflags="-s -w" -o ../brainbout .

build-linux: build
	cd server && GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ../brainbout-linux-amd64 .

build-windows: build
	cd server && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../brainbout-windows-amd64.exe .

build-android: build
	rm -rf android/app/src/main/assets
	mkdir -p android/app/src/main/assets
	cp -r dist/* android/app/src/main/assets/
	cd android && ./gradlew assembleDebug
	@echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"

all: lint build

test:
	bun test

lint: lint-go lint-kt lint-py lint-html lint-actions lint-toml lint-makefile
	bunx tsc --noEmit
	bun run lint
	bun run lint:css
	bun run format:check

lint-go:
	cd server && golangci-lint run ./...

lint-kt:
	@command -v ktlint >/dev/null 2>&1 && ktlint "android/**/*.kt" || echo "ktlint not installed, skipping"
	@command -v detekt-cli >/dev/null 2>&1 && detekt-cli --input android/ --all-rules || echo "detekt not installed, skipping"

lint-py:
	uv run ruff check
	uv run ruff format --check
	uv run ty check

lint-html:
	@command -v superhtml >/dev/null 2>&1 && superhtml check index.html games/*.html || echo "superhtml not installed, skipping"

lint-actions:
	@command -v actionlint >/dev/null 2>&1 && actionlint || echo "actionlint not installed, skipping"

lint-toml:
	@command -v taplo >/dev/null 2>&1 && taplo lint && taplo fmt --check || echo "taplo not installed, skipping"

lint-makefile:
	@command -v checkmake >/dev/null 2>&1 && checkmake Makefile || echo "checkmake not installed, skipping"

screenshot:
	bun run screenshot

clean:
	rm -rf dist server/web brainbout brainbout-linux-amd64 brainbout-windows-amd64.exe

install-tools: install-superhtml install-actionlint install-taplo install-checkmake

install-superhtml:
	@mkdir -p ~/.local/bin
	@curl -fsSL https://github.com/kristoff-it/superhtml/releases/latest/download/superhtml-x86_64-linux -o ~/.local/bin/superhtml
	@chmod +x ~/.local/bin/superhtml

install-actionlint:
	@mkdir -p ~/.local/bin
	@curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash | bash -s -- latest ~/.local/bin

install-taplo:
	@mkdir -p ~/.local/bin
	@curl -fsSL https://github.com/tamasfe/taplo/releases/latest/download/taplo-linux-x86_64.gz | gunzip > ~/.local/bin/taplo
	@chmod +x ~/.local/bin/taplo

install-checkmake:
	@go install github.com/checkmake/checkmake/cmd/checkmake@latest
