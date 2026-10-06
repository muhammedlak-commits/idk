/* Saleem Store — settings shared by the shop, the buying list and the admin portal.
 * Change them here, once.
 */
window.SALEEM_CONFIG = {
  // Orders and questions go to this WhatsApp. Same number as the Ozempic
  // funnel for now. Change it in admin → Settings → Call centre number; these two
  // are only the starting values (and the fallback if the settings are missing).
  whatsapp : "9647710335500",           // digits only, no +, for wa.me links
  bizPhone : "+964 771 033 5500",       // shown in the footer

  // Where the product list comes from.
  //   ""  → data/products.js, the file in this folder. Changes are made in
  //         admin.html and published by downloading an update.
  //   an Apps Script /exec URL (see apps-script/SETUP.md) → the Google Sheet.
  //         Admin edits and photos go live without touching these files, and
  //         data/products.js becomes the fallback if the Sheet can't be reached.
  catalogUrl: "",

  // Products with no uploaded photo show a reference thumbnail from a Bing
  // image search on the English name. Brands and models won't match stock.
  // false = show the department icon instead.
  webPhotos: true,
};
