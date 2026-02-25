.PHONY: dev build build-server build-linux build-windows clean

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

clean:
	rm -rf dist server/web chess960 chess960-linux-amd64 chess960-windows-amd64.exe
