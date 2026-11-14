/* Saleem Store — PRIVATE. Commission and partner-store contacts.
 * Read only by admin.html. Never deploy this folder (build-dist.sh leaves it out).
 *
 * stores      store id → { commission %, phone, contact, notes }
 * commission  product id → commission % that overrides its store's
 */
window.SALEEM_PRIVATE = {
"stores": {
  "mitech": {
    "commission": 0,
    "phone": "",
    "contact": "د. عبد الستار سعد عبد الستار، مدير قسم المبيعات",
    "notes": "Quote no. 617, 7/11/2026. Prices are the quote’s after-discount prices. Set the commission % before going live."
  }
},
"commission": {}
};
