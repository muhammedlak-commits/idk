# Saleem Store — home medical supplies
### Developer handoff

A bilingual (Arabic RTL default / English LTR) shop for Saleem's 224 home-care supplies.
Customers browse, build an order, and send it to Saleem's team on WhatsApp — there are
no prices or payments on the page; the team confirms price, stock and delivery in the chat.
**No framework, no build step.** Open `index.html` and it runs, including straight off disk.

```
index.html            the shop: home, departments, search, product pages, order + checkout
supplies.html         INTERNAL buying list by clinical tier — never deploy it
data/products.js      the one product list both pages read
assets/               logo + hero photo
_headers              cache + security headers (Netlify / Cloudflare Pages format)
build-dist.sh         assembles the public site into dist/
build-standalone.py   bundles each page into one shareable file
```

Run it locally:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

## How the shop is laid out

It's tab-based, not one long page. Every view has its own address (`#/…`), so the
back button moves between views and comes back to where you'd scrolled.

| Tab | Address | What's there |
|---|---|---|
| Home | `#/` | search, the 14 departments, "what did your Saleem visit recommend?", rent and monthly-refill rails, how ordering works |
| Departments | `#/departments`, `#/d/<dept>/<section>` | each department has section sub-tabs, a Buy / Rent / Monthly filter and a sort |
| Search | `#/search?q=…` | results update in place as you type — no jumping down the page. Arabic matching ignores hamza, taa marbuta and diacritics |
| My order | `#/order` | change quantity or buy/rent/monthly per line, then name, phone, area → WhatsApp |
| For clinics | `#/d/clinic` | the 23 B2B-only items, ordered as a quote request |

Product pages (`#/p/<id>`) show why a patient needs the item, which Saleem visits
usually call for it, and let the customer choose buy, rent or monthly refill.

On phones the tabs move to a bottom bar.

## Departments

The old 11 procurement categories were regrouped by what the patient needs. Customers
think "diabetes" or "bathroom", not "Monitoring & Diagnostics":

Walking & Mobility · Braces & Supports · Home Monitoring · Diabetes Care · Wound Care ·
Nursing & Injection Supplies · Continence & Catheter Care · Bed & Patient Room ·
Breathing & Oxygen · Physio & Pain Relief · Bathroom & Home Safety · Daily Living Aids ·
Personal Care & Comfort · Mother & Baby · **For Clinics** (B2B only)

Each has 2–4 sections. Change the grouping in `data/products.js`: the `departments`
list at the top, and each product's `dept` / `sub`.

## Before going live

- **WhatsApp number.** `CONFIG.whatsapp` in `index.html` is the Ozempic funnel's number
  for now. Swap in the store's own line when it has one.
- **Photos.** `CONFIG.webPhotos` loads reference thumbnails from a Bing image search on the
  product name. Fine for a prototype, but brands won't match stock, Bing can stop serving
  them, and they aren't licensed. Set it to `false` to show department icons instead,
  then add real photos.
- **Orders aren't stored.** They exist only as the WhatsApp message. If you want a record,
  post the same payload to an endpoint the way the funnel does (`apps-script/`) — use a
  separate sheet, not the Ozempic leads one.
- **The cart and customer details** are kept in the visitor's browser (localStorage) so
  they survive a reload. The page still works when storage is blocked.

## Deploying

**Deploy `dist/`, not this folder.** `./build-dist.sh` copies only `index.html`, `data/`,
`assets/` and `_headers`. `supplies.html` stays out — it's an internal procurement
reference.

```bash
./build-dist.sh --staging   # adds X-Robots-Tag: noindex for a test URL
./build-dist.sh             # production
```

The repo-root `netlify.toml` builds the **Ozempic funnel**, so the store needs its own
Netlify site: drag `dist/` onto [app.netlify.com/drop](https://app.netlify.com/drop), or
create a second site from this repo with build command `bash saleem-store/build-dist.sh --staging`
and publish directory `saleem-store/dist`.

For a preview you can send or open with no server, `python3 build-standalone.py` writes
`Saleem_Store_standalone.html` (~290 KB) and `Saleem_Supplies_standalone.html` with
everything inlined. Don't deploy those.

## Editing products

`data/products.js` has one line per product:

```js
{"id":2,"tier":1,"dept":"mobility","sub":"walking","rent":true,"refill":false,"b2b":false,
 "services":["physio","nursing","doctor"],"en":"Folding walker","ar":"مشاية طبية قابلة للطي",
 "whyEn":"…","whyAr":"…"}
```

- `id` is stable — saved carts and order messages (`[#2]`) refer to it. Never reuse one.
- `tier` is buying priority (1 = the care plan breaks without it). The shop sorts by it
  but never shows it to customers.
- `b2b: true` items belong in the `clinic` department and can only be quoted.

## Where this came from

It replaces two hand-made files: `saleem-store.html`, a one-page shop where search scrolled
you down the page, and `saleem-supplies-bilingual-with-photos.html`, the procurement list.
Both carried their own copy of the same 224 items. Now there's one list, and both pages
are built from it. The descriptions and Arabic names are carried over unchanged.
