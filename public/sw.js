// Offline support: keep a copy of the site so the tools still open without internet.
// Pages: try the network first (to get updates), fall back to the saved copy.
// Built files (scripts, styles, fonts): their names change with every build, so the saved copy is always right.
// Works wherever the site lives ("/" or a sub-folder such as GitHub Pages' "/devdeck/").
const CACHE = "devdeck-v3";
const BASE = new URL(self.registration.scope).pathname; // e.g. "/" or "/devdeck/"
const ICONS = ["icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"].map((f) => BASE + f);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`, ...ICONS])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(BASE)))
    );
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`) || ICONS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
