# Setting up the leads Sheet and the call-centre console

First time doing this? Follow it top to bottom. It takes about 15 minutes and there is
nothing to install — it all happens in the browser.

**What you're building.** Three things that pass data along a chain:

```
  landing page                Google Sheet                  console
  saleem-novo.netlify.app  →  (Apps Script receives      →  the same Apps Script
  patient fills the form      and stores every lead)        shows it to your team
```

The landing page never talks to the console directly. It posts each assessment to a small
Google script, that script writes a row in a Sheet, and the console reads rows back out.

---

## Step 1 — Make the Sheet

1. Go to **[sheets.new](https://sheets.new)**. A blank spreadsheet opens.
2. Name it something obvious, top-left: `Saleem — Ozempic leads`.

Don't add any headings or columns. The script creates them the first time a lead arrives.

## Step 2 — Open the script editor

In that Sheet: **Extensions → Apps Script**.

A new tab opens with a code editor. On the left is a file list showing one file, `Code.gs`,
containing:

```js
function myFunction() {
}
```

If it asks you to name the project, call it `Saleem Ozempic`.

## Step 3 — Paste in Code.gs

1. Click into the editor and select everything (**Ctrl+A** / **Cmd+A**), then delete it.
2. Paste the whole of the `Code.gs` file I sent you.
3. Save — the disk icon, or **Ctrl+S** / **Cmd+S**.

Your email is already in it, in two places: `ALLOWED_EMAILS` (who can open the console) and
`NOTIFY` (who gets alerted about hot leads). To add teammates later, add their addresses to
`ALLOWED_EMAILS`, one per line, each in quotes with a comma after.

## Step 4 — Add the console page

1. In the file list on the left, click the **+** next to *Files* → **HTML**.
2. Name it exactly **`Admin`** — lower-case `dmin`, capital `A`, and **no `.html`**;
   Apps Script adds that itself. Getting this name wrong is the most common mistake here,
   because `Code.gs` looks for a file called `Admin`.
3. It opens with some placeholder HTML. Select all, delete, paste the whole of `Admin.html`.
4. Save.

You should now have two files: `Code.gs` and `Admin.html`.

## Step 5 — Deploy it twice

This is the part that looks strangest, so here's why before the how.

One script, but two audiences. The **landing page** is public — anyone on the internet must be
able to submit an assessment without logging in. The **console** shows patient names, phone
numbers and medical answers, so it must be locked to your team. Apps Script sets access per
*deployment*, not per script, so you make two deployments of the same code with different
access settings. You get two different URLs.

### 5a — the Intake deployment (public)

1. Top-right: **Deploy → New deployment**.
2. Click the **gear icon** next to "Select type" → choose **Web app**.
3. Fill in:
   - **Description**: `Intake`
   - **Execute as**: `Me (your email)`
   - **Who has access**: **`Anyone`**
4. **Deploy**.
5. Google now asks for permission. This bit looks alarming and is normal — it's your own
   script asking to use your own Sheet and Gmail:
   - **Authorize access** → pick your Google account
   - A screen says *"Google hasn't verified this app"* → **Advanced** → **Go to Saleem
     Ozempic (unsafe)**
   - **Allow**
6. You get a **Web app URL** ending in `/exec`. **Copy it and paste it somewhere safe** —
   this is the one the landing page needs. Call it the *Intake URL*.

### 5b — the Console deployment (staff only)

1. **Deploy → New deployment** again.
2. Gear icon → **Web app**.
3. Fill in:
   - **Description**: `Console`
   - **Execute as**: `Me (your email)`
   - **Who has access**: **`Anyone with a Google Account`**  ← different from last time
4. **Deploy**, and copy this second `/exec` URL. Call it the *Console URL*.

You now have two URLs that look almost identical but end in different IDs. Keep them apart —
the Intake one goes in the website, the Console one goes to your team.

> Sanity check: open the Console URL in your browser. You should see the console, empty. If it
> says **Not authorised**, you're signed into a different Google account than the one in
> `ALLOWED_EMAILS` — check the address it shows and sign in as that one.

## Step 6 — Point the landing page at Intake

In the project folder on your computer:

```bash
./set-endpoint.sh <paste your Intake URL here>
```

That writes the URL into `index.html` and rebuilds both deployable folders. Run it with no
arguments any time to see which URL a build currently carries.

*(Editing by hand instead? It's the line near the top of the `<script>` block that reads
`endpoint   : "",` — put the URL between the quotes.)*

## Step 7 — Put the new build on Netlify

1. [app.netlify.com](https://app.netlify.com) → open your **saleem-novo** site.
2. **Deploys** tab.
3. Drag the rebuilt **`dist`** folder onto the drop area at the bottom.

Same URL, new version. Netlify keeps the old one so you can roll back.

## Step 8 — Test it end to end

1. Open **https://saleem-novo.netlify.app** on your phone.
2. Fill in the assessment with your own real phone number.
3. Check, in order:
   - a new row appears in the **Sheet**
   - the lead appears in the **console** (refresh, or wait a minute)
   - if it was a strong candidate, you get an **email**

If all three happen, you're live.

---

## When something doesn't work

**Nothing appears in the Sheet after submitting.**
Open the site, press **F12** → **Console** tab, submit again, and look for a red error.
"Failed to fetch" almost always means the Intake URL is wrong or the deployment's access
isn't `Anyone`. Re-check step 5a.

**The console says "Not authorised".**
It shows which account you're signed in as. Either sign in as the address in
`ALLOWED_EMAILS`, or add the one you're using. If your Google account isn't a Workspace
account, Apps Script sometimes can't see your address at all — in that case set
`ACCESS_KEY` in `Code.gs` to a long random string and open the console as
`<Console URL>?key=THAT-STRING`. Treat that link like a password.

**"Script function not found: doGet".**
The `Admin` file is named wrong, or `Code.gs` didn't save. Check step 4.

**You changed Code.gs and nothing happened.**
Editing the code does *not* update a live deployment. You must do
**Deploy → Manage deployments → pencil icon → Version: New version → Deploy**.
Do this for whichever of the two deployments you need. The URLs stay the same.

**Leads stop arriving after you edit something.**
Same cause as above, or `set-endpoint.sh` was never re-run after a rebuild. Run it with no
arguments to see what the current build points at.

---

## Everyday use

- The **call centre** bookmarks the Console URL. They can work from a phone.
- The **Sheet** is the source of truth and stays fully usable — sort, filter, chart, export.
  Only `status` and `notes` can be changed from the console; what the patient submitted
  can't be edited from a browser.
- Adding staff: add the address to `ALLOWED_EMAILS`, save, then redeploy the **Console**
  deployment (new version). No need to touch Intake.
