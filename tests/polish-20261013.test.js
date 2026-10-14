// polish-20261013: share tags, canonicals, /specials twin, 404 nav, sitemap.
const fs = require("fs"), path = require("path"), assert = require("assert");
const R = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const attr = (s, re) => (s.match(re) || [])[1];
const pages = { about: "/about", privacy: "/privacy", terms: "/terms", specials: "/specials" };
for (const [k, url] of Object.entries(pages)) {
  for (const f of [`${k}.html`, `${k}/index.html`]) {
    const s = R(f);
    assert.strictEqual(attr(s, /rel="canonical" href="([^"]+)"/), "https://rangebites.com" + url, f + " canonical");
    const d = attr(s, /name="description" content="([^"]+)"/);
    assert.ok(d, f + " description");
    assert.strictEqual(attr(s, /property="og:description" content="([^"]+)"/), d, f + " og desc");
    assert.strictEqual(attr(s, /name="twitter:description" content="([^"]+)"/), d, f + " tw desc");
    assert.match(attr(s, /property="og:image" content="([^"]+)"/), /^https:\/\/rangebites\.com\/og-image\.png\?v=\d+$/, f);
    assert.match(attr(s, /name="twitter:image" content="([^"]+)"/), /^https:\/\/rangebites\.com\/og-image\.png\?v=\d+$/, f);
    assert.ok(!/here\.now\/og/.test(s), f + " no foreign og image");
    if (f.includes("/")) assert.ok(!/(href|src)="(?!\/|\.\.\/|https?:|mailto:|#)[^"]+"/.test(s), f + " relative paths fixed");
  }
}
for (const f of fs.readdirSync(path.join(__dirname, "..")).filter((x) => x.endsWith(".html")).concat(["about/index.html","privacy/index.html","terms/index.html","specials/index.html"])) {
  const s = R(f);
  assert.ok(!/aaronbillings5386|private\.coffee/.test(s), f + " no stray handles");
}
const sp = R("specials.html");
assert.ok(/No specials are listed right now/.test(sp));
assert.ok(!/\$\d/.test(sp), "no invented prices");
const nf = R("404.html");
assert.ok(/<a href="\/">Home<\/a>/.test(nf) && /aria-label="Main"/.test(nf), "404 nav + Home");
const sm = R("sitemap.xml");
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.strictEqual(new Set(locs).size, locs.length, "sitemap deduped");
assert.ok(!locs.some((l) => /(about|privacy|terms|specials)\.html$/.test(l)), "no .html duplicates");
assert.ok(locs.includes("https://rangebites.com/specials"));
assert.ok(![...sm.matchAll(/<lastmod>([^<]+)</g)].some((m) => m[1] === "2026-09-01"), "fresh lastmod");
assert.ok(/^<svg[^>]*xmlns/.test(R("favicon.svg")), "svg favicon");
assert.ok(/class="brand-logo"[^>]*alt="[^"]+"/.test(R("index.html")), "logo alt");
console.log("ok - polish-20261013: share tags, canonicals, /specials twin, 404, sitemap, favicon, logo alt");
