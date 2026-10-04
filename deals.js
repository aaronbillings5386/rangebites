/**
 * RangeBites — deals from OSM listing text only.
 * Match promo keywords already tagged in a place name/description.
 * Do not invent chain, cuisine, amenity, or hash-based sample coupons.
 * Privacy: no persistence, no analytics, no network calls.
 */
window.RangeBitesDeals = (function () {
  "use strict";

  const PROMO_PATTERNS = [
    { re: /\b(bogo|buy\s*one\s*get\s*one|2\s*for\s*1|two\s*for\s*one)\b/i, label: "Mentions: BOGO", kind: "bogo" },
    { re: /\b(\d{1,2})\s*%\s*off\b/i, label: "Mentions: % off", kind: "pct" },
    { re: /\b(half\s*price)\b/i, label: "Mentions: half price", kind: "half" },
    { re: /\b(free\s+delivery|free\s+drink|free\s+dessert|kids\s+eat\s+free)\b/i, label: "Mentions: promo", kind: "free" },
    { re: /\b(happy\s*hour)\b/i, label: "Mentions: happy hour", kind: "hh" },
    { re: /\b(taco\s*tuesday)\b/i, label: "Mentions: Taco Tuesday", kind: "tt" },
    { re: /\b(lunch\s+special|lunch\s+set|prix\s*fixe|early\s*bird)\b/i, label: "Mentions: lunch special", kind: "lunch" },
    { re: /\b(\$\d{1,2}\s*(menu|lunch|deal|special|fill[\s-]*up))\b/i, label: "Mentions: $ deal", kind: "dollar" },
    { re: /\b(student\s+discount|senior\s+discount|military\s+discount)\b/i, label: "Mentions: discount", kind: "disc" },
    { re: /\b(rewards?|loyalty|punch\s*card)\b/i, label: "Mentions: rewards", kind: "rewards" },
    { re: /\b(coupon|promo\s*code)\b/i, label: "Mentions: coupon", kind: "coupon" },
  ];

  /* forge 20261003 (Proof): "no coupons", "coupons not accepted", "no happy hour" etc. are not promos. */
  var NEG_BEFORE = /\b(no|not|never|without|don'?t|do\s+not|doesn'?t|cannot|can'?t|zero)\s+(\w+\s+){0,2}$/i;
  var NEG_AFTER = /^\s*(\w+\s+){0,1}(not\s+(accepted|valid|available|honou?red|offered)|n'?t\s+accepted|excluded|unavailable|discontinued|ended)\b/i;
  function negatedAt(blob, idx, len) {
    var before = blob.slice(Math.max(0, idx - 40), idx);
    var after = blob.slice(idx + len, idx + len + 40);
    return NEG_BEFORE.test(before) || NEG_AFTER.test(after);
  }
  function positiveMatch(re, blob) {
    var g = new RegExp(re.source, re.flags.indexOf("g") >= 0 ? re.flags : re.flags + "g");
    var m;
    while ((m = g.exec(blob))) {
      if (!negatedAt(blob, m.index, m[0].length)) return true;
      if (m[0].length === 0) g.lastIndex++;
    }
    return false;
  }

  function hashName(name) {
    let h = 0;
    const s = (name || "").toLowerCase();
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /**
   * @param {{ name?: string, cuisine?: string, description?: string, amenity?: string }} place
   * @returns {{ label: string, detail: string, kind: string } | null}
   */
  function matchDeal(place) {
    place = place || {};
    const blob = String(place.description || "");
    for (const p of PROMO_PATTERNS) {
      if (positiveMatch(p.re, blob)) {
        return {
          label: p.label,
          detail: "From listing text — confirm with the restaurant. Not a live coupon feed.",
          kind: p.kind,
          tagged: true,
        };
      }
    }
    return null;
  }

  function isSponsoredCandidate() {
    return false;
  }

  /** Do not invent Sponsored flags. Return places unchanged. */
  function applySponsoredFlags(places) {
    return (places || []).map(function (p) {
      return Object.assign({}, p, { sponsored: false });
    });
  }

  return {
    matchDeal,
    applySponsoredFlags,
    isSponsoredCandidate,
    hashName,
    PROMO_PATTERNS,
    NAME_DEALS: [],
    CHAIN_DEALS: [],
    CUISINE_DEALS: [],
    AMENITY_DEALS: [],
  };
})();
