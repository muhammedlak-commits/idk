# Connecting the store to a Google Sheet

Optional. Without it, the admin portal keeps changes in your browser and you publish
by downloading an update file. With it, the Sheet *is* the product list: the admin
saves to it, photos go to your Google Drive, and the shop reads it live, with no files
to re-upload. It takes about 10 minutes, all in the browser.

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
2. **Copy the catalog into the Sheet**. This fills it with all products, plus any photos
   you'd uploaded in your browser draft.

The Sheet now has a **Products** tab, with the same columns as the bulk-upload spreadsheet.

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
