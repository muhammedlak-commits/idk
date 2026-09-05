# Ozempic® Program Funnel — Saleem × Novo Nordisk
### Developer handoff

A bilingual (Arabic RTL / English LTR) VSL + quiz funnel for the Ozempic® program.
**One HTML file, no framework, no build step.** Open `index.html` in a browser and it runs.
Currently in **demo mode** — the form validates and shows the thank-you page, but leads only
log to the browser console.

```
index.html      the whole funnel: landing page + quiz + result + thank-you view
assets/         4 images (logos + product shots), 141 KB total
_headers        cache + security headers (Netlify / Cloudflare Pages format)
```

Run it locally:

```bash
python3 -m http.server 8000
```

> Must be served over HTTP, not opened as `file://` — the quiz uses `history.pushState`.

---

## Where this came from

Built to the same architecture as the **breast cancer NGS funnel**: co-brand bar → hero →
VSL → trust badges → proof section → how it works → value stack → authority → timeline →
fit/not-fit → FAQ → final CTA → sticky bar, with a full-screen quiz overlay and a thank-you
view carrying a WhatsApp share loop. Same `CONFIG` block, same pixel event names, same
demo-mode behaviour, so both funnels can share one lead endpoint and one analytics setup.

Three things are deliberately different, and they matter:

1. **It's bilingual.** The breast cancer funnel is Arabic-only. This one carries the AR/EN
   toggle the original Ozempic page had, so every string lives in the `T` dictionary rather
   than in the markup. See *Adding or changing copy* below.
2. **There is no price on the page.** Ozempic is prescription-only and the cost depends on
   the dose a clinician sets, so hammering a single number the way the breast cancer funnel
   hammers ٤٥٠,٠٠٠ would be wrong here. The value stack says "you only pay for the
   medication, your doctor sets the dose." If that changes, set `CONFIG.priceIqd` and the
   real number renders everywhere automatically — nothing else to edit.
3. **The quiz has a safety screener.** Q4 asks about the real contraindications (MTC/MEN2,
   pregnancy, type-1 diabetes, pancreatitis). Selecting any of them does **not** kill the
   lead — it sets `safety` on the payload and routes the result to a `Review` band that says
   a doctor has to look at the case first. Those leads still need a call; they just need a
   different one.

---

## Your job: 4 things

### 1. Fill in `CONFIG`

Top of the `<script>` block at the bottom of `index.html`. Nothing else in the file needs editing.

| key | what it is |
|---|---|
| `bizPhone` | number displayed on the thank-you page and in the footer |
| `whatsapp` | digits only, no `+` (e.g. `9647701234567`) — builds the support wa.me link |
| `instagram` | destination for the soft-decline screen |
| `vslVideo` | the sales video — a YouTube/Vimeo **embed** url, or a local `assets/vsl.mp4` |
| `vslDur` / `tyDur` | duration badges shown on the two posters |
| `tyVideo` | the 45-second thank-you video |
| `endpoint` | **POST url for leads.** Empty = demo mode |
| `pixelId` | Meta pixel id |
| `priceIqd` | `0` = "price set by dose". A number renders that price in the value stack |
| `shareUrl` | link recipients get from the share button. Empty = this page's url + referral UTMs |
| `shareText` | WhatsApp share message, **per language**; `{link}` is substituted |

Both video slots accept either an embed URL or a direct file — the player detects which and
mounts an `<iframe>` or a `<video>` accordingly. Until a URL is set, the poster shows
*الفيديو قيد التحضير* / *Video coming soon* instead of failing.

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
  "goal":       "tried_everything",
  "commitment": "yes",
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
- `hot` — `band === "Likely"` **and** the patient committed to monthly follow-up. Best leads; give
  them the strongest closer.
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
| `ViewContent` | a video is played |
| `VideoWatch50` | ~95s into a video that was actually played |
| `InitiateCheckout` | quiz opened (carries `source`: which CTA was tapped) |
| `QuizQualified` | reached the result screen (carries `band`, `bmi`, `hot`) |
| `QuizDisqualified` | answered "لا" to the commitment question |
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
