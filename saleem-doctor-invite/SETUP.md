# Doctor invite — setup

The landing page is one self-contained `index.html` (about 390 KB). Everything the
doctor does — details, contract, signature, upload — runs through one Apps
Script deployment.

    doctor fills in name + phone
        │
        ▼  the page moves straight on and shows the contract text with their
        ▼  name and the date; meanwhile, in the background:
        ▼  POST action:"register"
    Apps Script appends a row to the Sheet and emails the team
        ▼  POST action:"contract"
    Apps Script copies the contract Doc, substitutes {{name}} {{day}} {{date}},
    blanks {{sig}}, exports PDF and files it in Drive — the doctor's copy
        │
        ▼  doctor ticks "I read it" and picks one of two ways to sign
        ▼  POST action:"signed"
    draw / photo — the signature image is filed in Drive and the row marked
        "signing". The doctor never re-uploads the contract.
    (The script still accepts a third route, mode "pdf" — a contract
        signed by hand and uploaded — but the page no longer offers it.)
        │
        ▼  the page moves on at once; the doctor's copy (unsigned) downloads
        ▼  doctor fills the Google registration form
        │
        ▼  within a minute, finishPending (a time trigger) stamps the
        ▼  signature into every {{sig}}, files the signed PDF, marks the row
        ▼  "signed" and emails the team. The signed copy never goes back to
        ▼  the page.

No Drive link is ever made public — the PDF travels inside the response.

---

## 1. The contract Doc

The contract must be a **Google Doc**, not a PDF, because Apps Script fills it
in by find-and-replace. The original contract was written in Google Docs, so
that Doc already exists.

Open it and put these three placeholders where the blanks are:

| Placeholder | Goes where |
|---|---|
| `{{name}}` | the blank after `الطرف الثاني: السيدة/السيد` on page 1, **and** after `السيد:` in the signature block on the last page |
| `{{day}}`  | the blank after `في يوم` on page 1 |
| `{{date}}` | the blank after `الموافق` on page 1 |
| `{{sig}}`  | where the signature belongs — in the الطرف الثاني column next to `التوقيع:`, and at the end of each page if you want it signed throughout |

Type them exactly, including the double braces. A placeholder may appear more
than once — every occurrence is replaced.

**`{{sig}}` is where a drawn or photographed signature gets stamped.** It is
ignored on the third route, where the doctor signs the PDF themselves — so
leave a visible line or empty cell next to `التوقيع:` for them to sign on.

They draw it with a finger on the page, and the script drops the image in at
every `{{sig}}` it finds — so put one next to `التوقيع:` in the الطرف الثاني
column, and one at the foot of each page if the contract should be signed
throughout.

The doctor's copy has those placeholders blanked out, so they never see
`{{sig}}` printed. Nothing is stamped into the الطرف الأول column —
that signature is yours to add.

### The wording also lives in the page

So that step 1 does not wait on a PDF, the page shows the contract text
itself (`id="contract"` in `index.html`). The PDFs are still built from the
Doc. **If you change the contract wording in the Doc, change it in the page
too**, or the doctor reads one text and signs another.

### ⚠️ The signature block must be a table

The signature block at the end currently fakes two columns with runs of spaces:

```
الطرف الأول                              الطرف الثاني
شركة المستقبل السليم ...                 السيد: {{name}}
التوقيع:                                 التوقيع:
```

That only lines up while the text is exactly as long as the placeholder. Swap
`{{name}}` for a real name and the line gets longer, wraps, and the whole block
collapses into the page header. Most real names are longer than `{{name}}`, so
this breaks for nearly everybody.

**Fix it before going live:**

1. Delete those three lines.
2. **Insert → Table → 2 × 3.**
3. Fill it in — right column is الطرف الأول, left column is الطرف الثاني:

   | (left cell) | (right cell) |
   |---|---|
   | `الطرف الثاني` | `الطرف الأول` |
   | `السيد: {{name}}` | `شركة المستقبل السليم للخدمات العامة المحدودة المسؤولية` |
   | `التوقيع:` | `التوقيع:` |

4. Select the table → **Format → Table → Table properties → Border width → 0pt**
   so the grid is invisible and it still looks like a plain signature block.

Now each column has its own width, a long name wraps inside its own cell, and
nothing can push into the header. This is also where you add a "sign here"
marker: an underline or an empty bordered cell next to `التوقيع:`.

Then copy the doc id out of the URL:

    docs.google.com/document/d/  1a2B3c4D...  /edit
                                └─ this bit ─┘

## 2. The Apps Script

1. Create a Google Sheet to hold the doctors. **Extensions → Apps Script.**
2. Paste in `apps-script/Code.gs`, replacing whatever is there.
3. Fill in the settings at the top:

   ```js
   var TEMPLATE_DOC_ID  = '1a2B3c4D...';   // the doc id from step 1
   var OUTPUT_FOLDER_ID = '';              // Drive folder for contracts; empty = root
   var NOTIFY           = [
     'first@saleemapp.com',                // both inboxes get every alert
     'second@saleemapp.com'
   ];
   var SITE_URL         = 'https://...';   // where the page is hosted
   ```

   Leave a `NOTIFY` line empty and it is skipped; leave both empty and nobody
   is told about new doctors — `testSetup` says so rather than failing quietly.

   **The recipients do not authorise anything.** They only receive mail. The
   one account that grants permission is the one that deploys the script, in
   step 2 below — which also means alerts are *sent from* that account and
   copies land in its Sent folder, even though they never hit its inbox. If the
   alerts should come from somewhere else, build the Sheet and the script under
   that account instead and deploy from there.

4. Run **testSetup** once from the function dropdown. Grant the permissions it
   asks for. It creates the sheet headers, checks that all four placeholders
   are present in the Doc, and installs the every-minute `finishPending`
   trigger that builds signed contracts and emails the team — read the log
   before going further. Opening the `/exec` URL shows `"finishTrigger": true`
   once it is in place.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**  ← must be Anyone, or doctors get a login wall
6. Copy the `/exec` URL.

## 3. Wire up the page

In `index.html`, near the bottom:

```js
const CONFIG = {
  endpoint    : "",              // ← paste the /exec URL here
  whatsapp    : "9647710335500", // the number behind "تواصل وينا على واتساب"
  maxUploadMb : 10
};
```

With `endpoint` empty the page runs in demo mode: the flow works but nothing is
stored and no contract is generated. **Nothing is saved until you paste the URL.**

Check the WhatsApp number — it is currently the one from the Ozempic funnel,
which may not be the right contact for doctors.

## 4. Deploy the page

It is a single file with no build step, so drag `index.html` onto tiiny.host,
Netlify Drop, or any static host. A subdomain such as `doctors.saleem.iq`
converts noticeably better than a random tiiny.host URL in an SMS.

---

## When the columns change

Nothing to do. `getSheet_` appends any column the sheet is missing, and rows
are written by header name rather than position, so a new version can add
fields without the tab being deleted or the order mattering.

## After editing Code.gs

Apps Script keeps serving the old code until you publish a new version:
**Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.**
The `/exec` URL stays the same.

If the new version asks for a permission the old one did not (the
`finishPending` trigger does), run **testSetup** once from the editor and
approve it. Until then the web app cannot run.

## Troubleshooting

| What you see | Cause |
|---|---|
| `العقد غير مهيأ بعد` | `TEMPLATE_DOC_ID` is empty |
| Contract arrives with `{{name}}` still in it | placeholder typed differently in the Doc — run `testSetup` |
| `الصفحة بوضع التجربة` | `CONFIG.endpoint` is still empty |
| Signature missing from the signed copy | no `{{sig}}` in the Doc — run `testSetup` (does not apply to the pdf route) |
| Doctors hit a Google login screen | the deployment is not set to "Anyone" |
| Nothing reaches the Sheet | you edited `Code.gs` but did not deploy a **new version** |
| Signed, but no "عقد موقّع" email | `finishPending` trigger not installed — run `testSetup`. Without it signing still works but builds the PDF while the doctor waits |
| Row stuck at `stamp_failed` | the signature could not be stamped; `notes` says why, and the team email links the signature file |
| Doctor saw a connection error but the email arrived | the write landed and only the reply was lost; the page now asks the script what happened and carries on |
