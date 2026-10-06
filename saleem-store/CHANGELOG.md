# Saleem Store: versions

The version is set in one place: `js/version.js`. Each version that's handed over goes up by
0.001 (v0.001, v0.002 … v0.010 …) and gets an entry here: what changed, and anything someone
has to do (redeploy the Sheet script, re-publish, change a setting).

The shop footer and the admin header show the version that's running. The single-file previews
are named after it (`Saleem_Store_v0.001.html`), and so is the admin's update zip.

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
