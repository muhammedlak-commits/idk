# Connecting the store to a Google Sheet

Optional. Without it, the admin portal keeps changes in your browser and you publish
by downloading an update file. With it:
- the Sheet *is* the store: products, partner stores, settings, kits and banners
- photos go to your Google Drive
- the shop reads it all live, with no files to re-upload
- every order is logged, so you get commission statements and refill reminders

It takes about 10 minutes, all in the browser.

```
  admin.html  ──save──▶  Google Sheet + Drive  ◀──read──  index.html (the shop)
              (code checked by Google)         (public, read-only)
```

## 1 — Make the Sheet

Go to **[sheets.new](https://sheets.new)** and name it `Saleem Store — products`.
Leave it empty; the script adds the headings.

> **Which Google account?** Use one that is allowed to share Drive files publicly.
> Company Workspace accounts often aren't. If yours isn't, photo uploads will fail with
> a message saying so. Everything else still works, and you can paste photo links instead.

## 2 — Paste in the script

In the Sheet: **Extensions → Apps Script**. Select everything in `Code.gs`, delete it,
paste in this folder's `Code.gs`, and save (**Ctrl/Cmd+S**).

The admin code is already set: `ADMIN_CODE = '335500'`.

## 3 — Run the setup check

In the function dropdown at the top, pick **`testSetup`**, then press **▶ Run**.

Google asks for permission the first time:
**Review permissions → your account → Advanced → Go to (unsafe) → Allow**.
It needs the Sheet (the product list) and Drive (the photo folder). "Unsafe" only
means Google hasn't reviewed a script you wrote yourself.

The log should end with *All good*.

> Don't press Run on `doGet` or `doPost`. They only work when the shop or admin calls them.

## 4 — Deploy

**Deploy → New deployment →** gear icon **→ Web app**

| | |
|---|---|
| Execute as | **Me** |
| Who has access | **Anyone** |

**Deploy**, then copy the **Web app URL**. It ends in `/exec`.

"Anyone" is what lets shoppers read the product list. Saving still needs the admin
code, which the script checks on every save.

## 5 — Fill the Sheet from the admin

Open `admin.html`, enter the code, then **Publish & connect**:

1. Paste the `/exec` URL → **Connect**.
2. **Copy everything into the Sheet**. This fills it with all products, stores, settings, kits and banners, plus any photos
   you'd uploaded in your browser draft.

The Sheet now has four tabs:

| Tab | What's in it |
|---|---|
| **Products** | the same columns as the bulk-upload spreadsheet, including the private `commission_pct` |
| **Stores** | partner stores, their commission % and contacts (private) |
| **Site** | settings, kits and banners, written by the admin. Don't edit this one by hand |
| **Orders** | one row per order from the shop: customer, items, total, commission, reminder date, status (new, confirmed, onway, delivered, cancelled) |

## 6 — Point the shop at it

In `config.js`, set:

```js
catalogUrl: "https://script.google.com/macros/s/…/exec",
```

Publish the site files once more. From now on, admin saves go live within a page load
or two. No more update files.

`data/products.js` stays as the fallback. If the Sheet can't be reached, a returning
visitor sees the last copy their browser saw, and a first-time visitor sees the file.

---

## Good to know

- **The public read never includes commission or store contacts.** Anyone with the
  `/exec` URL can see what the shop shows, and nothing more. Orders can only be read with
  the code.
- **Orders are logged as the customer taps Send.** The shop posts the order to the Sheet
  while it opens WhatsApp. Prices and commission are worked out on Google's side from the
  Sheet, not taken from the browser. Commission is fixed at that moment, so later changes
  to a store's % don't rewrite past orders. A cap of 60 orders per 10 minutes stops anyone
  flooding the tab.
- **Order tracking.** The shop's tracking page asks for the order number and the last 4
  digits of the phone it was sent from, and shows the status staff set in the Orders tab
  (or the admin), plus the items. Nothing else about the customer is ever returned, and
  lookups are capped at 300 per 10 minutes. If you set up the Sheet before this was
  added, paste in the new `Code.gs` and deploy a new version (see below).
- **Reminder links** point at the address in admin → Settings → *Published shop address*.
  Fill it in once the shop has a public URL.

- **Editing the Sheet by hand works.** The shop reads it on the next load. In the Sheet,
  a cell is exactly what's shown: blank means empty. (The bulk upload's
  "blank = leave as is" rule is only for uploaded files.) Keep the heading row. Rows
  without an id or a name are skipped. You can add your own columns, such as supplier or
  cost; they're kept and never shown.
- **After editing `Code.gs`:** **Deploy → Manage deployments → ✏️ → Version: New version
  → Deploy**. Saving alone doesn't update the live URL.
- **Changing the code:** change `ADMIN_CODE` in `Code.gs` (then redeploy), and `codeHash`
  in `admin.html` (the comment there says how). Change it when someone who knew it leaves.
- **Wrong codes:** after 8 in a row, all admin saves are refused for 15 minutes, even with
  the right code. That's what makes a 6-digit code hard to guess. The lock clears itself after
  15 minutes. It also means someone guessing can lock you out for a while; if that
  keeps happening, change the code.
- **Photos** go to a Drive folder called *Saleem Store photos*, shared "anyone with the
  link can view". Replacing a photo moves the old one to the Drive bin.
- **Quotas:** a free Google account handles thousands of shop visits a day. If the shop
  ever grows past that, move the catalog to a real database. The admin and shop only
  talk to the script, so only the script would change.
