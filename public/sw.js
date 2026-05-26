/**
 * Brainbout service worker.
 *
 * Scope:
 *   - Install/activate the worker so the page qualifies as installable PWA.
 *   - Network-first fetch with a tiny offline shell so the hub still opens
 *     on a flaky connection.
 *   - notificationclick: focus an existing tab if one is open, otherwise
 *     open the hub.
 *
 * Notifications themselves are scheduled from the page (Notification API)
 * because brainbout has no push server; the worker only handles the click
 * round-trip.
 */

const CACHE = "brainbout-shell-v1";
const SHELL = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        SHELL.map((url) =>
          // Best-effort: never block install on a single failed prefetch.
          cache.add(url).catch(() => undefined),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Don't try to handle cross-origin fonts/CDN; let the browser fetch them.
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((resp) => {
        const copy = resp.clone();
        if (resp.status === 200) {
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((cached) => cached ?? Response.error())),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow("./");
        return undefined;
      }),
  );
});
