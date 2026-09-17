# Saleem — doctor invite

SMS landing page recruiting doctors to offer online consultations through
Saleem. Five swipeable screens in Arabic (RTL), ending in a three-step
contract flow: fill in details → sign the generated contract by hand → upload it.

```
index.html              the whole page, self-contained, 54 KB
apps-script/Code.gs     contract generation + signed-upload intake
SETUP.md                how to wire the two together
```

**Before going live:** `CONFIG.endpoint` in `index.html` must hold the Apps
Script `/exec` URL, and `TEMPLATE_DOC_ID` in `Code.gs` must point at the
contract Doc. See `SETUP.md`. Until then the page runs in demo mode and stores
nothing.

## Notes

- **The contract is generated per doctor**, from a Google Doc template, so the
  name and date are real text rather than something typed into a PDF form —
  which is unreliable across mobile PDF viewers, especially in Arabic.
- **Signatures are handwritten only.** The script never fills a signature.
- **No public Drive links.** The PDF is returned inside the JSON response and
  the signed copy is posted back the same way.
- Progress is kept in `localStorage`, so a doctor who leaves to sign and comes
  back lands on the step they left rather than at the beginning.
