# Saleem Store — home medical supplies
### Developer handoff

A bilingual shop (Arabic right-to-left by default, English left-to-right) for Saleem's
home-care supplies, plus the admin portal to run it.

- **Shoppers** browse, build an order and send it to Saleem's team on WhatsApp. Prices are
  optional and there's no payment on the page; the team confirms price, stock and delivery
  in the chat.
- **No framework, no build step.** Every page opens straight off disk.

```
index.html            the shop: home, departments, search, product pages, order → WhatsApp
admin.html            the admin portal (code 335500): edit, bulk upload, photos, publish
supplies.html         INTERNAL buying list by clinical tier
config.js             WhatsApp number, where the catalog comes from, placeholder photos
data/products.js      the product list (or the fallback, once a Google Sheet is connected)
js/catalog.js         loads the catalog for all three pages
js/admin-lib.js       Excel / CSV / zip reading and writing, bulk-upload rules (admin only)
apps-script/          optional Google Sheet backend + SETUP.md
assets/               logo, hero photo; assets/products/ holds published product photos
build-dist.sh         assembles the public site into dist/
build-standalone.py   bundles each page into one shareable file
```

Run it locally:

```bash
python3 -m http.server 8000      # then open http://localhost:8000 and /admin.html
```

## The shop

It's tab-based. Every view has its own address (`#/…`), so the back button moves between
views and returns to where you'd scrolled.

| Tab | Address | What's there |
|---|---|---|
| Home | `#/` | search, the departments, "what did your Saleem visit recommend?", rent and monthly-refill rails |
| Departments | `#/departments`, `#/d/<dept>/<section>` | section sub-tabs, a Buy / Rent / Monthly filter, sorting |
| Search | `#/search?q=…` | results update in place. Arabic matching ignores hamza, taa marbuta and diacritics |
| My order | `#/order` | per-line buy, rent or monthly, then name, phone and area → WhatsApp |
| For clinics | `#/d/clinic` | the B2B-only items, ordered as a quote request |

When a product has a price, it shows on the card and the product page, and the order adds
up an estimated total. Without one, it says "price on WhatsApp". An **out-of-stock**
product stays visible with an "ask about availability" button. A **hidden** one isn't shown.

## The admin portal (`admin.html`)

Behind a 6-digit code (**335500**). Four tabs:

- **Products:** search and filter all products; click one to edit names, department,
  prices, rent/refill/clinic, services, status, descriptions and photo. You can add new
  products and delete them.
- **Bulk upload:** download every product as Excel (with dropdowns plus Departments and
  Help sheets) or CSV, edit it, and upload it back. A review shows every row as **new**,
  **updated** (old → new), **unchanged** or **error**, with the reason, before anything
  is applied. Rules:
  - a blank cell leaves the value as it is
  - `-` clears it
  - a row with no `id` is a new product
  - you can delete columns you don't need; only `id` has to stay
  - you can also paste rows straight from Excel or Google Sheets
- **Photos:** drop many photos at once. Files named after the product number
  (`23.jpg`, `23-front.png`) or its English name (`folding walker.png`) are matched
  automatically; the rest you pick from a list. Photos are shrunk to 1000px WebP in the
  browser. **A product with no uploaded photo keeps the Bing reference image as its
  placeholder.**
- **Publish & connect:** see below.

### Two ways to run it

**1. Local draft (works now, no setup).** Edits are kept in the browser you make them in.
- **Preview in the shop** shows the shop with your changes, visible only to you.
- **Download the update** gives a zip with a new `data/products.js` plus your photos in
  `assets/products/`. Unzip it into this folder and re-upload or commit it.

**2. Google Sheet (optional, ~10 minutes).** See [`apps-script/SETUP.md`](apps-script/SETUP.md).
- The Sheet becomes the product list and photos go to Google Drive.
- The shop reads the Sheet live, so admin saves go live without re-uploading anything.
- Staff can also edit the Sheet by hand; its columns match the bulk-upload spreadsheet.

### About the code

The check inside `admin.html` only decides whether the page opens. Anyone can read a web
page's source, so on its own it protects nothing.

What matters is where saves go:
- **Local mode:** edits never leave the browser they're made in, so there's nothing to
  protect.
- **Sheet mode:** Google checks the code again on every save (`ADMIN_CODE` in `Code.gs`).
  After 8 wrong codes, saves lock for 15 minutes.

Other notes:
- The portal locks itself after 30 minutes without use.
- To change the code, see the comment at the top of `admin.html`'s script and `SETUP.md`.

## Before going live

- **WhatsApp number:** `config.js` uses the Ozempic funnel's number for now.
- **Photos:** Bing placeholders are fine for a prototype. Brands won't match stock, and
  they aren't licensed. Replace them through the Photos tab. To show department icons
  instead of Bing images, set `webPhotos: false`.
- **Orders aren't stored.** They exist only as the WhatsApp message.

## Deploying

**Deploy `dist/`, not this folder.**
- `./build-dist.sh` copies only the shop.
- `supplies.html`, `admin.html` and `apps-script/` stay out.
- `--with-admin` adds the admin page. That's only useful once the Sheet is connected (see
  the script's comments).

```bash
./build-dist.sh --staging   # adds X-Robots-Tag: noindex for a test URL
./build-dist.sh             # production
```

**Hosting:** any static host works. The repo-root `netlify.toml` builds the Ozempic
funnel, so on Netlify the store needs its own site:
- drag `dist/` onto [app.netlify.com/drop](https://app.netlify.com/drop), or
- set build command `bash saleem-store/build-dist.sh --staging` and publish directory
  `saleem-store/dist`.

**Single files:** for a preview you can send or open with no server,
`python3 build-standalone.py` writes `Saleem_Store_standalone.html`,
`Saleem_Admin_standalone.html` and `Saleem_Supplies_standalone.html`. Keep the admin and
store files in the same folder, so that preview works. Don't deploy these files.

## Editing products by hand

`data/products.js` has one line per product. The admin writes this file for you.

```js
{"id":2,"tier":1,"dept":"mobility","sub":"walking","rent":true,"refill":false,"b2b":false,
 "services":["physio","nursing","doctor"],"en":"Folding walker","ar":"مشاية طبية قابلة للطي",
 "whyEn":"…","whyAr":"…","price":95000,"rentPrice":40000,"img":"assets/products/2.webp"}
```

- `id` is stable. Saved baskets and order messages (`[#2]`) refer to it, so never reuse one.
- `tier` is buying priority (1 means the care plan breaks without it). The shop sorts by it
  but never shows it to customers.
- `price`, `rentPrice`, `status` (`"out"` / `"hidden"`) and `img` are optional.
- Departments and their sections are defined at the top of the file. The admin and bulk
  upload don't create new ones; add them there by hand.

## Tests

The pages and the Apps Script were exercised with Playwright and Node. These scripts are
not checked in:
- **Shop:** search, tabs, the order message, and opening the pages off disk.
- **Admin:**
  - the code screen
  - editing a product and adding a new one
  - photo upload, one at a time and many at once
  - Excel and CSV round-trips, including a workbook written by SheetJS
  - the update zip, and previewing it in the shop
- **Google Sheet mode:** `Code.gs` run against stand-ins for Google's services, with the
  admin and the shop both talking to it. Covered:
  - saving products and photos
  - hidden items
  - hand edits made in the Sheet
  - the wrong-code lock
  - the fallbacks when the Sheet is down
