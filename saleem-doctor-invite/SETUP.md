# Doctor invite — setup

The landing page is one self-contained `index.html` (54 KB). Everything the
doctor does — details, contract, signature, upload — runs through one Apps
Script deployment.

    doctor fills in name + phone
        │
        ▼  POST action:"register"
    Apps Script copies the contract Doc, substitutes {{name}} {{day}} {{date}},
    exports PDF, files it in Drive, appends a row to the Sheet
        │
        ▼  PDF comes back inside the JSON response
    the page saves it so the doctor can read it
        │
        ▼  doctor ticks "I read it" and picks one of three ways to sign
        ▼  POST action:"signed"
    draw / photo — an image arrives, and the contract is rebuilt from the
        template with that signature stamped into every {{sig}}. The doctor
        never re-uploads the contract; the script can already make it.
    pdf — the doctor signed the downloaded contract by hand and sends it
        back. Nothing is stamped; their file is filed as the signed copy.
        │
        ▼  on the stamped routes the signed copy comes back, so they keep one
        ▼  doctor fills the Google registration form

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

The unsigned copy the doctor reads has those placeholders blanked out, so they
never see `{{sig}}` printed. Nothing is stamped into the الطرف الأول column —
that signature is yours to add.

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
   asks for. It creates the sheet headers and checks that all four
   placeholders are present in the Doc — read the log before going further.
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

`getSheet_` only writes headers into an empty sheet, so adding a column to
`COLUMNS` leaves an existing sheet one short and every new row lands shifted.
While the data is still test data the fix is to delete the `Doctors` tab and
let the script rebuild it. With real rows in it, insert the new column by hand
in the same position it holds in `COLUMNS`.

## After editing Code.gs

Apps Script keeps serving the old code until you publish a new version:
**Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.**
The `/exec` URL stays the same.

## Troubleshooting

| What you see | Cause |
|---|---|
| `العقد غير مهيأ بعد` | `TEMPLATE_DOC_ID` is empty |
| Contract arrives with `{{name}}` still in it | placeholder typed differently in the Doc — run `testSetup` |
| `الصفحة بوضع التجربة` | `CONFIG.endpoint` is still empty |
| Signature missing from the signed copy | no `{{sig}}` in the Doc — run `testSetup` (does not apply to the pdf route) |
| Doctors hit a Google login screen | the deployment is not set to "Anyone" |
| Nothing reaches the Sheet | you edited `Code.gs` but did not deploy a **new version** |
