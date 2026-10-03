/* RangeBites SW: installability + icon cache.
 * Cache writes are static icons only. Never cache /api/, /.herenow/, or a URL that carries coordinates.
 * data/ is not cached, so data/closed-places.json is always fetched from the network. */
const CACHE = "rb-static-v20261003g";

function mustNotCache(url) {
  if (url.pathname.indexOf("/api/") === 0) return true;
  if (url.pathname.indexOf("/.herenow/") !== -1) return true;
  if (/overpass|nominatim/i.test(url.pathname)) return true;
  if (/(?:^|[?&])(?:lat|lng|latitude|longitude)=/i.test(url.search || "")) return true;
  return false;
}

function isStaticAsset(url) {
  if (mustNotCache(url)) return false;
  return url.pathname.indexOf("/icons/") === 0;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  // Nuke every cache (incl. all rb-static-*) so mobile never keeps a stale app.js shell.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;
  if (mustNotCache(url)) return;
  // Always network-first for HTML/JS/CSS so mobile never sticks on an old app.js.
  const isShell = /\.(js|css|html?)$/i.test(url.pathname) || url.pathname === "/" || url.pathname.endsWith("/");
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && isStaticAsset(url)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => (isShell || !isStaticAsset(url) ? Promise.reject() : caches.match(req)))
  );
});
