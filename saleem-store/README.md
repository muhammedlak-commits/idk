# Saleem Store — home medical supplies
### Developer handoff

A bilingual shop (Arabic right-to-left by default, English left-to-right) for Saleem's
home-care supplies, plus the admin portal to run it.

- **Shoppers** browse, build an order and send it to Saleem's team on WhatsApp. Prices are
  optional and there's no payment on the page; the team confirms price, stock and delivery
  in the chat.
- **No framework, no build step.** Every page opens straight off disk.

```
index.html            the shop: home, departments, kits, finder, search, product pages, order → WhatsApp
admin.html            the admin portal (code 335500): products, stores, orders, kits, banners, settings…
supplies.html         INTERNAL buying list by clinical tier
config.js             WhatsApp number, where the catalog comes from, placeholder photos
manifest.webmanifest  lets phones install the shop as an app (name, icons, shortcuts)
sw.js                 keeps an offline copy of the shop in the browser
data/products.js      the product list (or the fallback, once a Google Sheet is connected)
data/site.js          settings, partner stores (public part), kits, banners
private/commercial.js PRIVATE: commission %, store contacts. Never deployed
js/catalog.js         loads the catalog for all three pages
js/admin-lib.js       Excel / CSV / zip reading and writing, bulk-upload rules (admin only)
apps-script/          optional Google Sheet backend + SETUP.md
assets/               logo, hero photo, app icons (icons/), the Cairo and Montserrat fonts (fonts/, OFL);
                      assets/products/ holds published product photos
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
| Home | `#/` | "what did your Saleem visit recommend?" first, then banners, kits, search and the departments grouped by need, then rent and monthly-refill rails |
| Departments | `#/departments`, `#/d/<dept>/<section>` | section sub-tabs, a Buy / Rent / Monthly filter, sorting |
| Search | `#/search?q=…` | results update in place. Arabic matching ignores hamza, taa marbuta and diacritics |
| My order | `#/order` | per-line buy, rent or monthly, then name, phone and area → WhatsApp |
| For clinics | `#/d/clinic` | the B2B-only items, ordered as a quote request |
| Photo of the list | `#/list` | photograph the handwritten list from a visit and send it on WhatsApp |
| Track an order | `#/track/<order no.>` | the status staff set in the Orders tab (needs the Google Sheet) |

When a product has a price, it shows on the card and the product page, and the order adds
up an estimated total. Without one, it says "price on WhatsApp". An **out-of-stock**
product stays visible with an "ask about availability" button. A **hidden** one isn't shown.

### What the admin switches on and off

Everything below is set in **admin → Settings / Kits / Banners**:

- **Banners**: the home page carousel. Each banner has an image (or a colour), a title, text and a button in both languages. The whole banner is one link (a department, a kit, a product, rentals, the finder, WhatsApp, or any web address). Optional start and end dates let you schedule offers.
- **Delivery promise**: "Delivered in 1–2 days", shown on the home page, every product and the order page. An optional delivery fee is added to the estimated total.
- **Payment methods**: cash on delivery, ZainCash, Qi Card, FastPay, card on delivery. Each is switched on or off; the customer picks one, and it goes into the order message.
- **Rentals**: one switch for the whole shop. When off, no rent option, badge, filter or rentals page appears anywhere. Rental terms (minimum period, deposit, what's included) and a per-product deposit are shown on rentable items.
- **Ask our nurse**: a WhatsApp button on its own number, plus the **Help me choose** finder: one question that suggests kits and departments.
- **Care kits**: ready-made bundles ("Bedridden care", "After hip or knee surgery", …). Each kit has its own page and an **Add the whole kit** button. Six come pre-made.
- **Clinics and bulk pricing**: the "For clinics" section, plus automatic quantity discounts (for example 10+ pieces 5% off, 25+ 10% off) shown on product pages and applied in the order.
- **Refill reminders**: customers who order monthly refills can ask to be reminded (needs the Google Sheet; see below).
- **Partner stores**: optionally show "Supplied by …" on product pages.

The shop also has:
- **Order again** for returning customers
- **Recently viewed** products
- a **Share** button on each product
- an **add-to-order bar** that stays on screen on phones
- an order number on every WhatsApp message
- **Add** on a card adds as a purchase, except in the Rent and Monthly lists, which add in that mode. The toast and the card say which mode went in.
- a sent order is remembered in the browser for 3 days. Opening the order again shows what was sent. Sending the same list again keeps its order number, so the Sheet logs it once. A changed list goes as a new order that names the one it updates. "Start a new order" asks before clearing the list.
- **Add** on an item that can be bought, rented or sent monthly opens a small choice sheet (a bottom sheet on phones) with each option's price.
- moving between pages animates: a product's photo grows from its card into the product page, and an added item flies into the order tab. People who turn off motion on their phone get no animation.
- **install as an app**: phones offer "Install" (iPhone: Share → Add to Home Screen). The shop then opens from its own icon, instantly, and the catalogue still works with no connection. Only over http(s); a file opened off disk can't install.
- **dark mode** follows the phone's setting; the moon/sun button in the header switches it.
- **running low**: a month after an order with monthly refills, the home page offers "Refill now" (from a week before it's due).
- **send a photo of the list**: on phones the photo goes straight into WhatsApp through the share menu; elsewhere the chat opens and the customer attaches it.
- **track an order**: the order number plus the last 4 digits of the phone it was sent from. The answer is the status and the items, nothing personal.
- on a kit page, untick what you already have. Adding a kit tops lines up to the kit's quantities rather than doubling them.

## Partner stores and commission

Delivery is done by the delivery company. Saleem earns a percentage on each partner store's sales:

- **Stores tab**: each partner store has a commission %, plus private contact details and notes.
- **On a product**: choose its store and, if needed, a different % for that one item. Bulk upload has `store` and `commission_pct` columns for doing this in one go.
- **Kept private**: commission and store contacts never reach the shop.
  - Locally they live in `private/commercial.js`, which `build-dist.sh` refuses to publish.
  - In the Google Sheet, the public read leaves them out.
- **Orders tab** (with the Sheet connected): every order from the shop is logged, and commission is worked out per line at the time of the order. Staff can:
  - set a final price on unpriced lines
  - mark orders confirmed, out for delivery, delivered or cancelled (the customer sees this on the tracking page)
  - see commission per store for any month (delivered orders only)
  - download the statement as CSV
- **Refill reminders**: these show up in the Orders tab on the day they're due. **Send reminder** opens WhatsApp to the customer with a link that refills their basket in one tap (`#/reorder/…`).

## The admin portal (`admin.html`)

Behind a 6-digit code (**335500**). Besides Stores, Orders, Kits, Banners and Settings (above), these tabs:

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
  placeholder.** With *Frame every photo the same way* on (the default), each photo is
  trimmed of its empty edges and centred on a white square at the same size, so photos
  taken by different people still look like one set. Photos with a real background (a
  room, a person) are kept whole.
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
- **Orders are logged only with the Google Sheet connected.** Without it, they exist only as the WhatsApp message (each with an order number).
- **`private/` is committed to this repo** so the admin works off disk. If the repo is ever made public, move that file out of it first.

## Deploying

**Deploy `dist/`, not this folder.**
- `./build-dist.sh` copies only the shop (with the app manifest and the offline worker).
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

- `id` is stable. Saved baskets, reorder links and order messages (`[#2]`) refer to it, so never reuse one.
- `store` is a partner store id from `data/site.js`. Commission is never in this file.
- `tier` is buying priority (1 means the care plan breaks without it). The shop sorts by it
  but never shows it to customers.
- `price`, `rentPrice`, `deposit`, `status` (`"out"` / `"hidden"`), `img` and `store` are optional.
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
