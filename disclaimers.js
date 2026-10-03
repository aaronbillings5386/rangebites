/* RangeBites — Gavel's layered disclaimers (2026-10-03 draft, research only, not legal advice).
 * One place for the card-level and first-search strings. Footer (layer 2) and Terms (layer 4) are static HTML.
 * All MUST-HAVE per Gavel. Edit text here only; app.js escapes the card strings.
 */
window.RB_DISCLAIMERS = Object.freeze({
  // Layer 1 — place card line (MUST-HAVE). Gavel option 3: source-neutral, stays true if hours sources change.
  placeCard: "Hours not checked by us · call before you go",
  // Layer 1 — deal / promo card line (MUST-HAVE)
  dealCard: "Promo from the listing · confirm before you order",
  // Layer 1 — pantry card line (MUST-HAVE, Gavel M3)
  pantryCard: "Hours, eligibility & supply vary · call the pantry first",
  // Layer 3 — first-search notice (MUST-HAVE). Static HTML from this file only (never data).
  firstSearchNoticeHtml: '<strong>Quick heads-up:</strong> hours, deals and pantry details come from OpenStreetMap and other public data and can be out of date. Please call ahead before you make a trip. Using RangeBites means you agree to our <a href="/terms">Terms</a>.'
});
