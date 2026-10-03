/* RangeBites: no analytics. UI switches only.
 *
 * ASSENT_MODE:
 *   "current"    Continue sheet stays hidden.
 *   "continue"   Show the Continue sheet until termsAccepted equals TERMS_VERSION.
 *   "browsewrap" Show the agree line under the search box.
 * TERMS_VERSION is the string stored when Continue is tapped. A new value
 * shows the Continue sheet again in "continue" mode, and the Terms-updated
 * notice until that version is dismissed. TERMS_UPDATED_LABEL is the date
 * in that notice.
 */
window.RB_CONFIG = Object.freeze({
  ASSENT_MODE: "current",
  TERMS_VERSION: "2026-10-03",
  TERMS_UPDATED_LABEL: "October 3, 2026",
});
