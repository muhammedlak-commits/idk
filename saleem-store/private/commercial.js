/* Saleem Store — PRIVATE. Commission, buying prices and partner-store contacts.
 * Read only by admin.html. Never deploy this folder (build-dist.sh leaves it out).
 *
 * stores      store id → { commission %, phone, contact, notes }
 * commission  product id → commission % that overrides its store's
 * offers      product id → [{ store, cost }]: every vendor of the item and our buying price
 *             from it (IQD), in order of preference. The shop only knows the store ids.
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
"commission": {},
"offers": {
  "14": [{"store":"mitech","cost":100000}],
  "79": [{"store":"mitech","cost":5000}],
  "225": [{"store":"mitech","cost":120000}],
  "226": [{"store":"mitech","cost":640000}],
  "227": [{"store":"mitech","cost":800000}],
  "228": [{"store":"mitech","cost":1100000}],
  "229": [{"store":"mitech","cost":7500000}],
  "230": [{"store":"mitech","cost":7500000}],
  "231": [{"store":"mitech","cost":1150000}],
  "232": [{"store":"mitech","cost":860000}],
  "233": [{"store":"mitech","cost":825000}],
  "234": [{"store":"mitech","cost":1300000}],
  "235": [{"store":"mitech","cost":28000}],
  "236": [{"store":"mitech","cost":21000}],
  "237": [{"store":"mitech","cost":600000}],
  "238": [{"store":"mitech","cost":1100000}],
  "239": [{"store":"mitech","cost":74000}],
  "240": [{"store":"mitech","cost":1600000}],
  "241": [{"store":"mitech","cost":68000}],
  "242": [{"store":"mitech","cost":38000}],
  "243": [{"store":"mitech","cost":100000}],
  "244": [{"store":"mitech","cost":29000}],
  "245": [{"store":"mitech","cost":43000}],
  "246": [{"store":"mitech","cost":50000}],
  "247": [{"store":"mitech","cost":1800000}],
  "248": [{"store":"mitech","cost":40000}],
  "249": [{"store":"mitech","cost":7500}],
  "250": [{"store":"mitech","cost":7500}],
  "251": [{"store":"mitech","cost":42000}],
  "252": [{"store":"mitech","cost":35000}],
  "253": [{"store":"mitech","cost":820000}],
  "254": [{"store":"mitech","cost":200000}],
  "255": [{"store":"mitech","cost":270000}],
  "256": [{"store":"mitech","cost":55000}],
  "257": [{"store":"mitech","cost":110000}],
  "258": [{"store":"mitech","cost":290000}],
  "259": [{"store":"mitech","cost":50000}],
  "260": [{"store":"mitech","cost":70000}],
  "261": [{"store":"mitech","cost":1000000}],
  "262": [{"store":"mitech","cost":125000}],
  "263": [{"store":"mitech","cost":425000}],
  "264": [{"store":"mitech","cost":150000}],
  "265": [{"store":"mitech","cost":155000}],
  "266": [{"store":"mitech","cost":250000}]
}
};
