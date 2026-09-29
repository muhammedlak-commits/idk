# Backlog

Done:
- Competitor milestones: Competitors tab in the Saleem Outside Factors sheet, diamonds on the Overview charts, Calendar table.
- Patient views: All patients / New / Returning in the filter bar (needs the latest orders export).
- UI overhaul and module order (grouped tabs; tell Claude a different order if wanted).
- Gateway providers and retention; provider follow-on and busy weeks.
- What changed and why (opening tab); sales and company revenue; false-discovery check on provider leads; automatic refresh through the Google Sheet.

Open:
- Check everything against the real exports (the files loaded in the browser can't be seen from the build).
- Set up the Metabase → Sheet refresh (automation/README.md) and check how large an export the Sheets connector reads comfortably.
- Doctor specialty: replace `NULL::text AS specialty` in the provider queries once the column is known.
