/* RangeBites: no analytics. This file only holds one UI switch.
 *
 * ASSENT_MODE (forge 20261003, Snitch item 6) — how the Terms are presented:
 *   "current"    DEFAULT. Today's live behaviour: the Continue sheet stays hidden, no extra line.
 *   "continue"   Show the existing "Before you use RangeBites … Tap Continue" sheet once per device
 *                (remembered in rb_ui_prefs.termsAccepted after the tap).
 *   "browsewrap" Show "By using RangeBites you agree to the Terms and Privacy Policy" under the search box.
 * To flip: change the string below, bump ?v= on config.js in index.html, publish. If you pick "continue"
 * or "browsewrap", make Terms §1 describe that method (it currently says "by tapping Continue on first use").
 */
window.RB_CONFIG = Object.freeze({ ASSENT_MODE: "current" });
