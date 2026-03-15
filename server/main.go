// Package main serves the brainbout web app and opens the browser.
package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"
)

//go:embed web
var webFiles embed.FS

const shutdownTimeout = 5 * time.Second

func main() {
	sub, err := fs.Sub(webFiles, "web")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", addHeaders(http.FileServer(http.FS(sub))))

	listenConfig := net.ListenConfig{}

	listener, err := listenConfig.Listen(context.Background(), "tcp", "127.0.0.1:8960")
	if err != nil {
		log.Fatal(err)
	}

	addr := "http://" + listener.Addr().String()
	log.Printf("Brainbout serving on %s", addr)

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: shutdownTimeout,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		serveErr := srv.Serve(listener)
		if serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			log.Fatal(serveErr)
		}
	}()

	go openBrowser(addr)

	<-ctx.Done()
	log.Println("Shutting down…")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)

	defer cancel()

	shutdownErr := srv.Shutdown(shutdownCtx)
	if shutdownErr != nil {
		log.Printf("Shutdown error: %v", shutdownErr)
	}
}

func addHeaders(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		h.ServeHTTP(w, r)
	})
}

func openBrowser(url string) {
	var cmd string

	var args []string

	switch runtime.GOOS {
	case "windows":
		cmd, args = "cmd", []string{"/c", "start", url}
	case "darwin":
		cmd, args = "open", []string{url}
	default:
		cmd, args = "xdg-open", []string{url}
	}

	startErr := exec.CommandContext(context.Background(), cmd, args...).Start()
	if startErr != nil {
		log.Printf("Could not open browser: %v", startErr)
	}
}
