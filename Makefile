.PHONY: dev build build-server build-linux build-windows build-android clean lint lint-go lint-kt screenshot

dev:
	npx vite

build:
	npx vite build
	rm -rf server/web
	cp -r dist server/web

build-server: build
	cd server && go build -ldflags="-s -w" -o ../chess960 .

build-linux: build
	cd server && GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ../chess960-linux-amd64 .

build-windows: build
	cd server && GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../chess960-windows-amd64.exe .

build-android: build
	rm -rf android/app/src/main/assets
	mkdir -p android/app/src/main/assets
	cp -r dist/* android/app/src/main/assets/
	cd android && ./gradlew assembleDebug
	@echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"

lint: lint-go lint-kt
	npm run lint
	npm run lint:css
	npm run format:check

lint-go:
	gofmt -l server/ | grep . && exit 1 || true
	cd server && go vet ./...
	cd server && staticcheck ./...

lint-kt:
	@command -v ktlint >/dev/null 2>&1 && ktlint "android/**/*.kt" || echo "ktlint not installed, skipping"

screenshot:
	npm run screenshot

clean:
	rm -rf dist server/web chess960 chess960-linux-amd64 chess960-windows-amd64.exe
