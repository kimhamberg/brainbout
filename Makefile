.PHONY: dev build build-server build-linux build-windows build-android clean

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

clean:
	rm -rf dist server/web chess960 chess960-linux-amd64 chess960-windows-amd64.exe
