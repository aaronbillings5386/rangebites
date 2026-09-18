/* RangeBites SW: installability + icon cache. Never cache /api/. Network-first for pages. */
const CACHE = "rb-static-v20260918a";
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
  if (url.pathname.indexOf("/api/") === 0) return;
  // Always network-first for HTML/JS/CSS so mobile never sticks on an old app.js.
  const isShell = /\.(js|css|html?)$/i.test(url.pathname) || url.pathname === "/" || url.pathname.endsWith("/");
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && url.pathname.indexOf("/icons/") === 0) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => (isShell ? Promise.reject() : caches.match(req)))
  );
});
