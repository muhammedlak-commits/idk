# Where the leads go

**Short answer: right now, nowhere.** `CONFIG.endpoint` in `index.html` is empty, so the
funnel runs in demo mode — the form validates, the thank-you page shows, and the lead is
written to the browser console and then lost when the tab closes. Nothing is stored, nothing
is emailed, no one is notified.

This is deliberate: the page ships working end-to-end so you can test and demo it, without
silently posting real patient data somewhere nobody agreed on. Pick a destination below and
it starts storing.

---

## What gets sent

One `POST` per submission, JSON body, at the moment the patient taps the final button:

```json
{
  "age": 42, "sex": "male",
  "height_cm": 174, "weight_kg": 104, "bmi": 34.4,
  "condition": "yes",
  "safety": [],
  "band": "Likely",
  "hot": true,
  "name": "أحمد محمد",
  "phone": "07701234567",
  "whatsapp": true,
  "area": "baghdad_karkh",
  "program": "ozempic",
  "price_iqd": null,
  "lang": "ar",
  "url": "https://…",
  "ts": "2026-09-05T10:41:22.318Z"
}
```

The two fields that decide what happens next:

- **`safety`** — non-empty means the patient declared a contraindication (MTC/MEN2,
  pregnancy, type-1 diabetes, pancreatitis). These go to a clinician, never to a sales close.
- **`hot`** — BMI and condition put them squarely in the program's criteria. Best leads.

---

## Option A — Google Sheet (fastest, free, no server)

Good for launch and for the call centre: a shared sheet the team can work top-to-bottom,
filter by `band`, and mark up.

1. Create a Google Sheet → **Extensions → Apps Script**.
2. Paste `apps-script/Code.gs` from this repo, Save.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: **Anyone***.
4. Copy the `/exec` URL into `CONFIG.endpoint`.
5. Submit a test lead; a row appears.

Set `NOTIFY` at the bottom of `Code.gs` to an email address and it also mails you on hot and
safety-flagged leads. Leave it empty and it stays quiet.

**Why `endpointType` is `text/plain`:** Apps Script doesn't answer the CORS preflight that an
`application/json` POST triggers, so a JSON POST fails in the browser with no useful error.
Posting `text/plain` avoids the preflight entirely; the body is still JSON and the script
parses it the same way. This is already set correctly in `CONFIG` — don't "fix" it unless you
move off Apps Script.

**Limits:** Apps Script allows roughly 20k URL-fetch-free executions/day, far above what this
funnel will produce. A Sheet slows down past tens of thousands of rows. Fine for a year.

## Option B — Saleem CRM / backend (where this should end up)

Point `CONFIG.endpoint` at an internal endpoint and set:

```js
endpointType: "application/json"
```

Requirements on your side:

- Accept `POST` with a JSON body and return **any 2xx**. A non-2xx shows the patient an Arabic
  retry message and re-enables the button.
- Allow the funnel's origin via CORS (`Access-Control-Allow-Origin`), and answer the `OPTIONS`
  preflight.
- **Re-validate server-side.** `phone` is masked and checked client-side, but anyone can post
  arbitrary JSON to a public endpoint. Re-check `/^07\d{9}$/`, clamp `age`/`height_cm`/
  `weight_kg`, and recompute `bmi` rather than trusting it.
- Be idempotent-ish, or de-duplicate on `phone` + a short time window. Iraqi mobile
  connections drop, patients retap, and you'll see the occasional double.
- Store the enum values (`baghdad_karkh`, `first_degree`, …), not the Arabic display labels.

## Option C — Make / Zapier / n8n webhook

Paste the webhook URL into `CONFIG.endpoint`, keep `endpointType` as `application/json`, and
fan out to Sheets + WhatsApp + the CRM from there. Slowest to debug, easiest to change later.

---

## Also worth wiring

**The Meta pixel is separate from the lead store.** `CONFIG.pixelId` only drives ad
attribution; it never stores a lead you can call. You need both.

**Add server-side CAPI** with the hashed phone number. Iraqi iOS traffic loses roughly 30% of
attribution on the browser pixel alone.

**Nothing retries yet.** If the POST fails the patient sees a retry message and the button
comes back — but if they close the tab, that lead is gone. If you see this happening in the
logs, the cheap fix is to keep failed payloads in `localStorage` and flush them on the next
page load.
