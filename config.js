/* RangeBites: no analytics. UI switches only.
 *
 * ASSENT_MODE:
 *   "continue"   Show the Continue sheet until termsAccepted equals TERMS_VERSION.
 *   "current"    Continue sheet stays hidden.
 *   "browsewrap" Show the agree line under the search box.
 * PUBLISH_DATE is the effective date (YYYY-MM-DD). TERMS_VERSION and the
 * Terms-updated notice both come from it. The same date is also plain text
 * in the HTML (Terms, Privacy, and the home notice) so it shows without JS.
 */
const PUBLISH_DATE = "2026-10-05";

function publishDateLabel(iso) {
  const parts = String(iso || "").split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (!y || !m || !d || !months[m - 1]) return "";
  return months[m - 1] + " " + d + ", " + y;
}

window.RB_CONFIG = Object.freeze({
  ASSENT_MODE: "continue",
  PUBLISH_DATE: PUBLISH_DATE,
  TERMS_VERSION: PUBLISH_DATE,
  TERMS_UPDATED_LABEL: publishDateLabel(PUBLISH_DATE),
});

function applyPublishDate() {
  const label = (window.RB_CONFIG && window.RB_CONFIG.TERMS_UPDATED_LABEL) || "";
  const nodes = document.querySelectorAll("[data-publish-date]");
  for (let i = 0; i < nodes.length; i++) nodes[i].textContent = label;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyPublishDate);
  else applyPublishDate();
}
