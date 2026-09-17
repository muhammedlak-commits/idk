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
    the page saves it to the doctor's phone
        │
        ▼  doctor signs by hand (Acrobat Fill & Sign, or print + photograph)
        ▼  POST action:"signed"
    Apps Script files the signed copy next to the original and emails the team

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

Type them exactly, including the double braces. A placeholder may appear more
than once — every occurrence is replaced.

**Leave the signature lines empty.** Signatures are handwritten; the script
never fills them. If you want a visible "sign here" marker, add a bordered
table cell or an underline in the Doc at the end of each page and next to
`التوقيع:` on the last page.

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
   var NOTIFY           = 'you@saleemapp.com';
   var SITE_URL         = 'https://...';   // where the page is hosted
   ```

4. Run **testSetup** once from the function dropdown. Grant the permissions it
   asks for. It creates the sheet headers and checks that all three
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
| Doctors hit a Google login screen | the deployment is not set to "Anyone" |
| Nothing reaches the Sheet | you edited `Code.gs` but did not deploy a **new version** |
