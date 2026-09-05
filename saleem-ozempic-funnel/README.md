# Ozempic® Program Funnel — Saleem × Novo Nordisk
### Developer handoff

A bilingual (Arabic RTL / English LTR) landing page + eligibility quiz for the Ozempic® program.
**One HTML file, no framework, no build step.** Open `index.html` in a browser and it runs.
Currently in **demo mode** — the form validates and shows the thank-you page, but leads only
log to the browser console.

```
index.html            the whole funnel: landing page + quiz + result + thank-you view
assets/               2 logos + 3 product shots
_headers              cache + security headers (Netlify / Cloudflare Pages format)
build-standalone.py   bundles the above into one shareable file
apps-script/Code.gs   Google Sheets lead receiver + console backend
apps-script/Admin.html the call-centre console (Arabic, phone-friendly)
LEADS.md              where submitted leads go — read this before launch
```

> **Leads are not stored yet.** `CONFIG.endpoint` is empty, so the funnel runs in demo mode.
> **[LEADS.md](LEADS.md)** explains what's sent and how to point it at a Sheet or your CRM.

Run it locally:

```bash
python3 -m http.server 8000
```

**Deploy `dist/`, not this folder.** `./build-dist.sh` assembles it: `index.html`, `assets/`
and `_headers`, nothing else. This folder also holds `apps-script/` — your staff allowlist and
access key — which must never reach a web host.

```bash
./build-dist.sh --staging   # adds X-Robots-Tag: noindex for a test URL
./build-dist.sh             # production
```

Netlify: drag `dist/` onto [app.netlify.com/drop](https://app.netlify.com/drop) for a throwaway
URL, or connect the repo and let the root `netlify.toml` run the build. Drop `--staging` from
its command when you go live.

For a preview you can email or open with no server, `python3 build-standalone.py` inlines the
images as base64 into a single ~590 KB HTML file. It works over `file://` (the history calls
are guarded, so the back button simply switches off there). Don't deploy that one — base64
costs about a third more bytes and can't be cached per-asset.

---

## Where this came from

Built to the same architecture as the **breast cancer NGS funnel**: co-brand bar → hero →
dosing → trust badges → proof section → how it works → value stack → authority →
fit/not-fit → FAQ → final CTA → sticky bar, with a full-screen quiz overlay and a thank-you
view carrying a WhatsApp share loop. Same `CONFIG` block, same pixel event names, same
demo-mode behaviour, so both funnels can share one lead endpoint and one analytics setup.

There is **no video section**. The breast cancer funnel is built around a 3-minute VSL; this
one isn't, so the slot that would hold it carries the dosing/titration story instead — the
strongest reassurance argument for a GLP-1, and the one that most reduces "will this make me
sick?" drop-off.

Three things are deliberately different, and they matter:

1. **It's bilingual.** The breast cancer funnel is Arabic-only. This one carries the AR/EN
   toggle the original Ozempic page had, so every string lives in the `T` dictionary rather
   than in the markup. See *Adding or changing copy* below.
2. **The offer is a free front end onto a paid program, not a single price.** The breast
   cancer funnel hammers ٤٥٠,٠٠٠ in six places; that shape doesn't fit here. What's free is
   the **online assessment** and the **call from Saleem's trained team** (pharmacists and
   junior doctors). Everything else — the full medical assessment and prescription, dose
   titration, in-home nurse injection training, monthly follow-up, the nutrition consult, and
   the medication itself — is **inside the paid program**. The value stack is split into
   those two groups on purpose, and the page's whole promise is "free to find out, you only
   pay if you decide to start."

   Because Ozempic is prescription-only and cost follows the dose a clinician sets, the total
   line reads *"price set after your call"* rather than a number. When there is a number to
   publish, set `CONFIG.priceIqd` and it renders in the total automatically — nothing else to
   edit. **Do not** move any paid item into the free group to make the offer look better.
3. **The quiz has a safety screener, and nothing else.** Four questions, every one of which
   changes the result:

   | # | asks | why it's there |
   |---|---|---|
   | 1 | age + sex | the under-18 gate, and basics the caller needs anyway |
   | 2 | height + weight | BMI — the whole eligibility calculation |
   | 3 | type-2 diabetes or a weight-related condition | moves the BMI 27–30 band |
   | 4 | contraindications | forces the `Review` band |

   Motivation and commitment questions were cut deliberately: they profile the lead but don't
   change eligibility, and every extra tap costs completions. **Don't add questions the
   result doesn't use** — put them in the call script instead, where a pharmacist can ask
   them for free.

   Q4's contraindications (MTC/MEN2, pregnancy, type-1 diabetes, pancreatitis) do **not** kill
   the lead — they set `safety` on the payload and route the result to a `Review` band saying
   a doctor has to look at the case first. Those leads still need a call; just a different one.

---

## Your job: 4 things

### 1. Fill in `CONFIG`

Top of the `<script>` block at the bottom of `index.html`. Nothing else in the file needs editing.

| key | what it is |
|---|---|
| `bizPhone` | number displayed on the thank-you page and in the footer |
| `whatsapp` | digits only, no `+` (e.g. `9647701234567`) — builds the support wa.me link |
| `instagram` | destination for the soft-decline screen |
| `endpoint` | **POST url for leads.** Empty = demo mode — see [LEADS.md](LEADS.md) |
| `endpointType` | `text/plain…` for Google Apps Script, `application/json` for a normal API |
| `pixelId` | Meta pixel id |
| `priceIqd` | `0` = "price set after your call". A number renders that program price in the value stack |
| `shareUrl` | link recipients get from the share button. Empty = this page's url + referral UTMs |
| `shareText` | WhatsApp share message, **per language**; `{link}` is substituted |

### 2. Build the lead endpoint

`index.html` does `POST {CONFIG.endpoint}` with `Content-Type: application/json`:

```json
{
  "age":        42,
  "sex":        "male",
  "height_cm":  174,
  "weight_kg":  104,
  "bmi":        34.4,
  "condition":  "yes",
  "safety":     [],
  "band":       "Likely",
  "hot":        true,
  "name":       "أحمد محمد",
  "area":       "baghdad_karkh",
  "phone":      "07701234567",
  "whatsapp":   true,
  "program":    "ozempic",
  "price_iqd":  null,
  "lang":       "ar",
  "url":        "https://…",
  "ts":         "2026-09-05T10:41:22.318Z"
}
```

**Field notes**

- `phone` — always 11 digits, `07XXXXXXXXX`. Already validated client-side; validate again server-side.
- `band` — `Likely` / `Possible` / `Review` / `Unlikely`, computed from BMI + the weight-related
  condition, with `Review` overriding everything when a safety flag is set. This is your routing key.
- `hot` — `band === "Likely"`. Best leads; give them the strongest closer.
- `safety` — **read this before calling.** A non-empty array means a contraindication was
  declared. Never route these to a sales close; they go to a clinician.
- `bmi` — already computed, one decimal. Recompute server-side if you don't trust the client.
- `area` — `baghdad_karkh`, `baghdad_rusafa`, or `other_gov`. Unlike the home-visit funnel this
  one isn't Baghdad-locked, because the first touch is a phone consult. Delivery still is —
  flag `other_gov` for ops.
- Enum values are stable strings; the Arabic/English labels are display-only. Store the enums.

Return any 2xx. On a non-2xx the user sees a localized retry alert and the button re-enables —
so make the endpoint idempotent-ish, or expect the occasional duplicate on a flaky Iraqi
mobile connection.

### 3. Wire the Meta pixel

Add the standard pixel snippet to `<head>`. The page calls `fbq('track', …)` on its own — it's
guarded by `if (window.fbq)`, so nothing breaks while the pixel is absent.

| event | fires when |
|---|---|
| `InitiateCheckout` | quiz opened (carries `source`: which CTA was tapped) |
| `QuizQualified` | reached the result screen (carries `band`, `bmi`, `hot`) |
| `Lead` + `CompleteRegistration` | form submitted (carries `band`, `hot`) |
| `Share` | share button tapped on the thank-you page |

`QuizQualified` fires for **every** band including `Unlikely` — it marks "reached the result",
not "qualified". Filter on `band` when you build audiences.

**Add server-side CAPI** with the hashed phone number. Iraqi iOS traffic loses roughly 30% of
attribution on browser-pixel alone.

### 4. Self-host the font

`index.html` pulls Cairo + Manrope (the Saleem brand faces) from Google Fonts. On Iraqi mobile
networks that's a visible delay and a render-blocking third-party request. Download the woff2
files, serve them from `assets/`, and swap the `<link>` for a local `@font-face` block.

---

## Adding or changing copy

Every user-visible string lives in `T.ar` / `T.en` near the top of the script. The markup
carries only keys:

| attribute | sets |
|---|---|
| `data-t="key"` | `textContent` |
| `data-th="key"` | `innerHTML` — for copy containing `<b>` or `<br>` |
| `data-tp="key"` | `placeholder` |
| `data-ta="key"` | `aria-label` |

`T.ar.bands` / `T.en.bands` hold the four result screens; `T.ar.faq` / `T.en.faq` are arrays of
`[question, answer]` and the accordion is rendered from them.

**If you add a key to one language, add it to the other.** There is no fallback — a missing key
renders as the key name. This one-liner catches it:

```bash
python3 - <<'PY'
import re
s=open('index.html').read()
need=set(re.findall(r'data-t[hpa]?="([^"]+)"',s))|set(re.findall(r"\bt\('([^']+)'\)",s))
for l in ('ar','en'):
    have=set(re.findall(r"'([A-Za-z0-9_.]+)'\s*:",re.search(r"T\.%s = \{(.*?)\n\};"%l,s,re.S).group(1)))
    print(l,'missing:',sorted(need-have) or 'none')
PY
```

---

## Please don't break these

- **Don't blur the free/paid line.** Only the assessment and the team call are free. The
  value stack, the hero line, the dosing note, the 4-step section, the timeline, the FAQ, the
  result bands and the thank-you page all say the same thing; if the commercial model
  changes, they all have to change together. Search for `stack.freeH` / `stack.paidH` and
  `hero.free` as the starting points.
- **The first call is the trained call centre, not the prescriber.** Copy says "الفريق الطبي /
  the medical team" (pharmacists and junior doctors), never "a Saleem doctor calls you". The
  prescribing physician appears later, at the paid step where the prescription is written.
- **The safety screener is not a decline.** Q4's contraindication chips route to the `Review`
  band and still capture the lead. Do not turn it into a hard stop, and do not let the
  `Review` copy imply the patient is approved.
- **The medical disclaimer in the footer stays**, and so does the `fine` line under the final
  CTA. Ozempic® is prescription-only, Novo Nordisk owns the mark, and every band message says
  a clinician confirms. Keep it that way.
- **No result screen promises a prescription.** All four band messages say the doctor decides.
  `Likely` says "الطبيب لازم يأكد" for a reason.
- **`dir` flips on the `<html>` element, and the layout depends on it.** Logical properties
  (`inset-inline`, `padding-inline`, `margin-inline`, `border-inline`) are used throughout so
  the layout mirrors correctly on the language toggle. Don't replace them with `left`/`right`.
- **The chart SVG stays `direction:ltr`** and uses Latin digits with no unit inside the plot.
  Time reads left→right in both languages, and mixing a `~` with an Arabic unit inside SVG
  text reorders under bidi. The unit lives in the heading and the tap readout instead, where
  Arabic uses the word `حوالي` rather than `~` for the same reason.
- **The quiz double-tap lock.** A `busy` flag in the option handler stops a fast double-tap
  from skipping a question. It existed as a bug; it's fixed; don't refactor it out.
- **The language toggle is duplicated in the quiz header** (`#qlang`). The co-brand one is
  behind the overlay and unreachable mid-quiz. Both call the same `toggleLang`.
- **Arabic-Indic numerals are display-only.** `fmtNum()` converts for display; form inputs and
  everything in the payload use Latin digits.
- **The share link has no phone number in it.** `wa.me/?text=…` with no recipient is what makes
  WhatsApp open its contact picker so the user chooses who receives it. Adding a number breaks that.
- **`img { height: auto }` in the reset stays.** The product shots set `width` only; without it
  they render at their intrinsic 507px height and the hero doubles in length.

## The images

Five files in `assets/`, referenced by name — replace a file and the page picks it up, no
markup change needed.

| file | what it is |
|---|---|
| `logo-saleem.png` | Saleem wordmark, transparent |
| `logo-novo.png` | Novo Nordisk lockup, transparent, quantised to ~10 KB |
| `ozempic-hero.webp` | hero product shot — a single pen on a clean surface |
| `ozempic-hand.webp` | a hand holding a pen, dose window visible (desktop hero only) |
| `ozempic-doses.webp` | the three pens with 0.25 / 0.5 / 1 mg labels (dosing section) |

The Novo file supplied was opaque RGB. The footer whites the logo out with
`filter:brightness(0) invert(1)`, which turns an opaque logo into a solid white block — so its
white background was lifted to alpha (with a soft edge so the antialiasing survives) and the
empty margin trimmed. **Keep any replacement transparent**, or drop the footer filter.

Everything else on the page is an inline SVG sprite, so there is no other photography to
source and no icon requests.

## The call-centre console

`apps-script/Admin.html` — a second face on the same Sheet, for the team making the calls.
Counters, filter tabs, search by name or phone, one-tap call/WhatsApp/copy, a status per lead
and a notes box that saves back to the Sheet. Leads that declared a contraindication carry a
banner telling the agent to route them to a clinician rather than close them.

It is served by the same Apps Script project as the intake endpoint but from a **separate
deployment** with different access, so the public endpoint can stay anonymous while the
console stays staff-only. Full setup in [LEADS.md](LEADS.md).

## Known cosmetic notes

- Arabic month labels on the chart come from `toLocaleString('ar', {month:'short'})`, which
  gives the Latin-derived set (يناير، فبراير…). Iraqi usage often prefers كانون الثاني / شباط.
  If ops wants those, hardcode a 12-item array — the locale set is too long for the axis at 8.5px.
- The projection curve is `MONTHLY_LOSS`, a cumulative fraction of starting weight reaching
  10.5% at month six. It's one constant array; change it there and both charts follow.

## Performance

Page is ~120 KB of HTML (all copy for both languages, inline CSS and JS) plus 141 KB of images.
Icons are an inline SVG sprite, so the page needs **zero icon requests** and no photography.
The only third-party request today is the font, and item 4 above removes that.

If you want the last chunk: the two product JPEGs are the biggest assets (81 KB) — converting
them to WebP saves roughly half. There was no encoder available when this was built.

## Browser support

Modern mobile Safari and Chrome. Uses `IntersectionObserver`, `history.pushState`, CSS logical
properties, `aspect-ratio`, `backdrop-filter`, SVG sprites via `<use>`. No polyfills, no IE.
Honors `prefers-reduced-motion` — reveals, the sheen, and the chart draw-on all stand down.
