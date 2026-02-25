package main

import (
	"context"
	"embed"
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

func main() {
	sub, err := fs.Sub(webFiles, "web")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", addHeaders(http.FileServer(http.FS(sub))))

	ln, err := net.Listen("tcp", "127.0.0.1:8960")
	if err != nil {
		log.Fatal(err)
	}
	addr := "http://" + ln.Addr().String()
	log.Printf("Chess960 serving on %s", addr)

	srv := &http.Server{Handler: mux}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	go openBrowser(addr)

	<-ctx.Done()
	log.Println("Shutting down…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
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
	if err := exec.Command(cmd, args...).Start(); err != nil {
		log.Printf("Could not open browser: %v", err)
	}
}
