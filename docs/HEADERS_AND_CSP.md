# Headers and CSP

## What the files ask for

`_headers` (root) and `vercel.json` carry the same set:

| Header | Value |
| --- | --- |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| Content-Security-Policy | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.de; connect-src 'self'; font-src 'self' data:; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `geolocation=(self), camera=(), microphone=(), payment=()` |

Each HTML page also has a CSP `<meta>` (the same policy minus `frame-ancestors`, which browsers ignore in a meta tag) and a `<meta name="referrer">`.

## Rules

- `script-src 'self'`: no inline scripts and no inline event handlers. The only inline `<script>` is JSON-LD, which isn't executable.
- `connect-src 'self'`: every network call goes through same-origin `/api/*` proxy routes. A new upstream means a new route in `.herenow/proxy.json`, not a CSP change.
- `style-src 'unsafe-inline'` remains because Leaflet and the holiday SVG art set inline styles.

## What the host actually does (checked 2026-10-04)

- here.now documents **no** support for `_headers` or custom response headers. Live `/_headers` returns 404, so treat the file as intent until here.now confirms support.
- here.now adds its own headers: `permissions-policy: microphone=(self), camera=(self), geolocation=(self)`, `referrer-policy: no-referrer`, and `access-control-allow-origin: *` on some static files.
- Cloudflare adds `report-to` and `nel` (Network Error Logging). This is disclosed in Privacy §5.
- To enforce the table above, either here.now adds header support or a Cloudflare Transform Rule (Modify Response Header) sets the same values. ACAO and NEL can only be removed at that layer.

Check with `forge/tools/check_headers.sh https://rangebites.com/`.
