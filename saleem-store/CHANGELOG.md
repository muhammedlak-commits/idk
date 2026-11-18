# Saleem Store: versions

The version is set in one place: `js/version.js`. Each version that's handed over goes up by
0.001 (v0.001, v0.002 … v0.010 …) and gets an entry here: what changed, and anything someone
has to do (redeploy the Sheet script, re-publish, change a setting).

The shop footer and the admin header show the version that's running. The single-file previews
are named after it (`Saleem_Store_v0.001.html`), and so is the admin's update zip.

## v0.004 (18 Nov 2026)

**Admin**
- **Reports tab** covers orders coming in and going out for any period:
  - received, delivered, open, cancelled, average days to deliver
  - a received-vs-delivered chart
  - sales, buying cost, net margin (IQD and %), commission, delivery fees, average order value
  - tables by vendor, best-selling item and province
  - Excel download
  - Without the Sheet connected, it reads a CSV/Excel copy of the Orders tab.
- **Products list:** separate **Selling** and **Buying** columns, plus **Net margin** showing
  IQD and % of the selling price in one column (red when it's a loss). The buying price is the
  default vendor's; the lowest offer shows under it when there are several.
- **Publish / hide:**
  - a switch on every product in the list and on every store card;
  - hiding a store hides every item that has no other published vendor (the list flags them);
  - **Publish shown** / **Hide shown** act on the current filters;
  - a **Readiness** filter (our photo + a vendor vs. placeholders);
  - **Show only our items** publishes the ready items and hides every placeholder in one step.
- **Delivery toggles:**
  - product editor: **Large item** and **Free delivery on this item**;
  - store editor: **Free delivery on all its items**;
  - Settings: the large-item notice in both languages;
  - Bulk upload: `large` and `free_delivery` columns.
- **Orders:** staff can correct an order's delivery fee, and each line shows its buying price.

**Shop**
- **Delivery fee:** 5,000 IQD per order, shown on product pages, in the basket total and in the
  WhatsApp message.
  - Large items show a notice that delivery may cost more, and the message flags it.
  - An order delivers free when all its items are waived. Free items get a "Free delivery"
    badge.
  - Rentals include delivery and pickup, so they don't add the fee.
- **Visibility:** hidden items, and items whose stores are all unpublished, are gone from the
  shop, its search and its vendor pages.
- **Phone review fixes:**
  - vendor names on cards no longer break in Arabic ("التقنيات الحديثة (M-Tech)" shows as its
    name);
  - basket item names are easier to tap;
  - the admin products list no longer makes phones zoom out.

**Google Sheet:**
- the Products tab gains `large` and `free_delivery`, and the Stores tab gains `free_delivery`;
- the public read drops items whose stores are all unpublished;
- each order logs `delivery_iqd` and `cost_iqd` (older Orders tabs get the headings added).

**Paste in the new `Code.gs` and deploy a new version.**

## v0.003 (14 Nov 2026)

**Several vendors per product, each with our buying price**
- A product can now be supplied by any number of partner stores. For each one the admin keeps
  what we pay them: our buying price. It's private like commission. It lives in
  `private/commercial.js`, or in the Sheet's `vendors` column, and never reaches the shop.
- Admin → product editor: a Vendors section. Add or remove vendors, enter each one's buying
  price, see the margin against the selling price (red when it's a loss), and pick the default.
  The first vendor is the default: orders go to it.
- The product's price is now labelled what it always was: the **selling price to customers**.
- Products list: shows the default vendor, "+N" for the others, and the default's buying price.
  The store filter finds an item under any of its vendors.
- Bulk upload:
  - a new `vendors` column (`mitech=120000; al-nahrain=118000`), and `store` now sets the
    default vendor;
  - the price column is now called `sell_price_iqd` (older files with `buy_price_iqd` still
    work);
  - new: "A price list from <store>". Upload a vendor's filled-in price form (the top-50 form)
    and its price column is filed as that vendor's buying price for each item. Names, selling
    prices and rent aren't touched, and an item that isn't in the catalogue is flagged.
- Shop: the product page lists every vendor (each links to its page), cards show the default
  vendor and "+N", each vendor's page lists every item it supplies, and search finds an item by
  any of its vendors' names.
- M-Tech's 44 items: the quote's "after" price is now our buying price from M-Tech. The selling
  price is the quote's "before" price for now (e.g. rigid cervical collar: we buy at 100,000 and
  sell at 160,000).
- Google Sheet: the Products tab gains a private `vendors` column, and `buy_price_iqd` is
  renamed `sell_price_iqd` on the next save. The public read lists only store ids. Each order
  line records the default vendor and its buying price, but order tracking never shows it.
  **Paste in the new `Code.gs` and deploy a new version.**

**To do:** set the selling price on M-Tech's items wherever the "before" price isn't right. The
vendor price form and the invitation letter still ask for "your selling price to the customer".
If vendors should send their price to Saleem instead, they need rewording.

## v0.002 (14 Nov 2026)

**M-Tech's catalogue and vendor profiles**
- 44 items from M-Tech (التقنيات الحديثة, quote no. 617) are in the shop with their photos and the
  quote's after-discount prices: 42 new products (ids 225–266) and M-Tech's price and photo on two
  existing ones (rigid cervical collar #14, incentive spirometer #79).
- The patient monitors (12B, 15B Plus), the Holter ECG and the two ear washing units are under
  For clinics and sold by quote; their quoted prices are kept for the admin.
- Every product shows the store that supplies it: on its card, and as a link on the product page.
- Each partner store has its own page in the shop (`#/v/<store id>`): logo, area, about text and all
  its products with department filters. A directory of partner stores is at `#/stores`, linked from
  the Departments page and the footer. Searching a store's name finds its products.
- Admin → Stores: each store now has a logo (upload or link) and an about text in both languages,
  and a link to its page in the shop. Uploaded logos go into the update zip (`assets/stores/`) or,
  with the Sheet connected, to Drive.
- Google Sheet: the Stores tab gains `logo_url`, `about_en` and `about_ar`; the public read includes
  them and still never commission or contacts. **Paste in the new `Code.gs` and deploy a new version.**

**To do before going live:** set M-Tech's commission % in admin → Stores (it's 0 for now), upload
their proper logo there (the current one is cropped from the quote's scan), and confirm the ear
washing units' price (7,500,000 IQD looks like a typo).

## v0.001 (6 Oct 2026)

The first named version: everything built up to now.

**Shop** (`index.html`)
- Bilingual: Arabic right to left by default, English left to right. Departments grouped by
  need, product pages, search that handles Arabic spelling variants, kits, the "Help me
  choose" finder, rent and monthly refills, a clinic section with bulk pricing.
- The home page leads with "What did your Saleem visit recommend?", then banners, kits,
  search and the departments in three groups.
- Orders go to WhatsApp with an order number. The sent order is remembered for 3 days.
  Sending the same list again keeps its number; a changed list names the order it updates.
- A choice sheet for Buy / Rent / Monthly, page transitions, Undo when removing an item.
- "Send a photo of the list", order tracking (needs the Google Sheet), a "running low"
  refill reminder on the home page.
- Installs as an app and works offline (when hosted). Dark mode. Self-hosted Cairo and
  Montserrat fonts.
- Delivery to every province of Iraq. The order form asks for the province.

**Admin** (`admin.html`, code 335500)
- Products, partner stores with commission % (kept private), orders and commission
  statements, kits, banners, settings, bulk upload (Excel/CSV), photos (framed the same
  way on upload), publish and connect.
- Settings include the call centre number (the WhatsApp that orders go to, plus an
  optional number to call), delivery, payment methods, rentals, the nurse line, clinics,
  refill reminders.
- Same look as the shop, including dark mode.

**Google Sheet backend** (`apps-script/Code.gs`, optional)
- The Sheet holds products, stores, settings and orders; photos go to Drive.
- Order tracking lookup (order number + last 4 digits of the phone) and the "Out for
  delivery" status. If the script was deployed before this, paste in the new `Code.gs` and
  deploy a new version.
