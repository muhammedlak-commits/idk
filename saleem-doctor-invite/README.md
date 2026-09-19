# Saleem — doctor invite

SMS landing page recruiting doctors to offer online consultations through
Saleem. A single-scroll Arabic (RTL) page — hero, trust strip, why-online,
why-Saleem, what-you-get, how-it-works, FAQ — ending in a three-step contract
flow: fill in details → read the contract → sign it with a finger on the page
→ fill the registration form.

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
- **The doctor signs on the page**, drawing with a finger (or uploading a photo
  of their signature). The script stamps that image into every `{{sig}}` in the
  template and returns a signed PDF — no printing, no file upload, no app switch.
- **Consent is explicit.** The signature cannot be submitted until the doctor
  ticks that they read the contract, and the server refuses it too.
- **No public Drive links.** The PDF is returned inside the JSON response and
  the signed copy is posted back the same way.
- Progress is kept in `localStorage`, so a doctor who leaves to sign and comes
  back lands on the step they left rather than at the beginning. The finished
  state has a way out — a "تسجيل طبيب آخر" link, or `?reset` on the URL.
- **No image assets.** The page is one file with the logo inlined once and the
  hero as inline SVG, so it stays drag-and-drop deployable.
