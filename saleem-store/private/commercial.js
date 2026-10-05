/* Saleem Store — PRIVATE. Commission and partner-store contacts.
 * Read only by admin.html. Never deploy this folder (build-dist.sh leaves it out).
 *
 * stores      store id → { commission %, phone, contact, notes }
 * commission  product id → commission % that overrides its store's
 */
window.SALEEM_PRIVATE = {
"stores": {},
"commission": {}
};
