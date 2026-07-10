// Simple offline-first service worker for Daglog.
// Bump CACHE when you ship new assets so old caches are cleared.
const CACHE = "daglog-v5";
// Relative to the service worker's own location, so the same worker caches
// correctly whether served from a domain root or a subpath (/test-app/).
const CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Secretaresse: achtergrondmeldingen via Web Push (nieuwe mail, afspraken die
// zo beginnen) — de Worker stuurt deze, ook als de app niet openstaat.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Secretaresse", body: event.data ? event.data.text() : "" };
  }
  // Elke melding krijgt een unieke tag (bv. per mail/afspraak), anders zou een
  // nieuwe melding een vorige met dezelfde tag vervangen — dan zie je maar één
  // van meerdere nieuwe mails. `renotify` zorgt dat een nieuwe melding alsnog
  // trilt/geluid geeft. `data.url` is de tab die geopend moet worden bij een tik.
  const tag = data.tag || `secretaresse-${Date.now()}`;
  event.waitUntil(
    self.registration.showNotification(data.title || "Secretaresse", {
      body: data.body || "",
      icon: "icon-192.png",
      badge: "favicon-32.png",
      tag,
      renotify: true,
      lang: "nl",
      data: { tab: data.url || "secretaresse" },
    })
  );
});

// Agenda reminders: focus an existing window (or open one) when a
// notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Open de bijbehorende tab (Secretaresse-meldingen zetten data.tab). We geven
  // 'm mee als ?tab=… zodat de app het juiste tabblad toont; een al open venster
  // krijgt het via postMessage en wordt gefocust.
  const tab = event.notification.data && event.notification.data.tab;
  const target = tab ? `./?tab=${encodeURIComponent(tab)}` : "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if (tab) client.postMessage({ type: "open-tab", tab });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Network-first for navigations so updates are picked up when online,
  // falling back to the cached app shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("index.html")))
    );
    return;
  }

  // Cache-first for other assets, filling the cache on first fetch.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
