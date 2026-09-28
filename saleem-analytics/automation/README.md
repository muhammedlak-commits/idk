# Automatic refresh: Metabase → Google Sheet → dashboard

Opened in claude.ai, the dashboard reads the *Saleem Outside Factors* Google Sheet live, through your Google Sheets connector. This script fills that sheet with the Metabase exports on a timer, so nobody has to download CSVs.

What you need: someone who can create Metabase API keys (a Metabase admin), and edit access to the sheet.

1. **Save the questions in Metabase.** For each file in `sql/`, create a SQL question with the query, no date filter, and save it. Note the number in its URL (`…/question/123-orders-daily` → `123`). You can skip the ones you don't use.
2. **Create an API key.** Admin › Settings › Authentication › API keys › Create. Give it a group that can run those questions; read-only access to the database is enough.
3. **Add the script.** Open the sheet › Extensions › Apps Script. Replace the contents of `Code.gs` with `metabase_to_sheet.gs`, fill in the question numbers in `QUESTIONS`, and save.
4. **Add the settings.** Project Settings (gear icon) › Script properties:
   - `METABASE_URL`: your Metabase address, for example `https://metabase.saleemservices.com`
   - `METABASE_API_KEY`: the key from step 2

   The key stays in the script's settings; it isn't written into the sheet.
5. **Run it.** Choose `refreshAll` › Run, and approve the permissions. It creates a `data_…` tab per question and a `data_log` tab. Then run `installTrigger` once to refresh every 6 hours (change `HOURS` for another interval).

The dashboard's Data tab then shows "Google Sheet, refreshed automatically", with the refresh time for each box. If a refresh fails, the tab keeps its last good copy and `data_log` shows the error, and so does the Data tab.

Notes:
- Anyone who can open the sheet can see these numbers. They are totals by day, service and provider, with no patient names, but share the sheet only with people who should see them.
- Big exports make the page slower to open. The provider export is the largest; leave its question number blank if the page gets slow.
- If Metabase is on a private network that Google can't reach, this script can't fetch from it. Use Metabase's own scheduled exports, or keep loading files by hand in the Data tab.
