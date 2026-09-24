# Saleem — doctor invite

SMS landing page recruiting doctors to offer online consultations through
Saleem. A single-scroll Arabic (RTL) page — hero, trust strip, why-online,
why-Saleem, what-you-get, how-it-works, FAQ — ending in a three-step contract
flow: fill in details → read the contract → sign it with a finger on the page
→ fill the registration form.

```
index.html              the whole page, self-contained, about 390 KB
apps-script/Code.gs     contract generation + signed-upload intake
SETUP.md                how to wire the two together
```

**Before going live:** `CONFIG.endpoint` in `index.html` must hold the Apps
Script `/exec` URL, and `TEMPLATE_DOC_ID` in `Code.gs` must point at the
contract Doc. See `SETUP.md`. Until then the page runs in demo mode and stores
nothing.

## Hero picture and clips

Both live in the `MEDIA` block at the top of the script section in
`index.html`. Both ship empty, and the video section stays hidden until
something is configured, so the page cannot go out half-built.

```js
const MEDIA = {
  heroImage: "",            // "" keeps the drawing that ships with the page
  heroAlt  : "...",
  videos: []                // [] hides the whole section
};
```

A clip is one of three shapes:

| Shape | Use when |
|---|---|
| `{ youtube: "VIDEO_ID" }` | the clip is on YouTube, **Unlisted** (Private will not embed) |
| `{ drive: "FILE_ID" }` | the clip is in Drive, shared **anyone with the link** |
| `{ src: "clip.mp4", poster: "clip.jpg" }` | the file is uploaded beside `index.html` |

Shoot portrait — the frames are 9:16, and landscape clips letterbox.

`src` means the page is no longer one file: upload a zip of `index.html`
plus the media instead. Watch the weight — a clip that downloads before it
plays is worse over Iraqi mobile than an embed that streams.

## Notes

- **The contract is generated per doctor**, from a Google Doc template, so the
  name and date are real text rather than something typed into a PDF form —
  which is unreliable across mobile PDF viewers, especially in Arabic.
- **Two ways to sign**, chosen by the doctor: draw with a finger on the page,
  or upload a photo of a signature. Neither re-uploads the contract — only the
  signature image goes up and the script stamps it into every `{{sig}}`.
- **The doctor reads the contract on the page**, so step 1 only saves their
  details. Nothing is downloaded at any point: the signed contract is filed
  for the team and never sent back to the page.
- **One email per doctor**, with the signed contract attached. The doctor
  cannot pass step 2 until it has gone; meanwhile a progress bar runs for
  about 20 seconds with a few lines about Saleem (`FACTS` in the script).
- **Consent is explicit.** The signature cannot be submitted until the doctor
  ticks that they read the contract, and the server refuses it too.
- **No public Drive links.** The doctor's copy is returned inside the JSON
  response, and the signed upload is posted the same way.
- Progress is kept in `localStorage`, so a doctor who leaves to sign and comes
  back lands on the step they left rather than at the beginning. The finished
  state has a way out — a "تسجيل طبيب آخر" link, or `?reset` on the URL.
- **No separate image files.** The logo, the two call screens and the six
  journey steps are inlined as WebP, so the page stays one drag-and-drop file.
