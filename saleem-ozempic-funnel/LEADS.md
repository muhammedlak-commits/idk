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

## Option A — Google Sheet + the call-centre console (fastest, free, no server)

This is the recommended setup. It gives you a Sheet holding every lead **and** a phone-friendly
console the call centre works from — see [The console](#the-console) below.

1. Create a Google Sheet → **Extensions → Apps Script**.
2. Paste `apps-script/Code.gs` over the placeholder code, Save.
3. **File → +  → HTML**, name it exactly `Admin` (Apps Script adds the `.html`), paste
   `apps-script/Admin.html`, Save.
4. At the top of `Code.gs`, add your staff to `ALLOWED_EMAILS` and optionally set `NOTIFY`.
5. Deploy **twice** — same code, two URLs with different access:

   | deployment | Execute as | Who has access | used by |
   |---|---|---|---|
   | **Intake** | Me | **Anyone** | the landing page |
   | **Console** | Me | **Anyone with a Google Account** | the call centre |

   *Deploy → New deployment → Web app*, once for each.
6. Put the **Intake** `/exec` URL into `CONFIG.endpoint` in `index.html`.
7. Give the **Console** `/exec` URL to the team. Submit a test lead and check both.

Why two: the landing page is public, so its endpoint must accept anonymous posts. The console
shows patient names, phone numbers and medical answers, so it must not. `doGet` refuses anyone
who isn't on `ALLOWED_EMAILS`, so even someone who finds the public Intake URL gets nothing.

> If Apps Script can't see your staff's email (common outside Google Workspace, where
> `Session.getActiveUser()` returns empty), set `ACCESS_KEY` in `Code.gs` and open the console
> as `<console-url>?key=YOUR-SECRET`. That's a shared secret in a URL, not real authentication
> — treat the link as a password, and prefer `ALLOWED_EMAILS` whenever it works.

## The console

`apps-script/Admin.html`, served from the Console deployment. Arabic, works on a phone.

- **Counters** — total, today, strong candidates not yet called, needs medical review, booked.
- **Tabs** — all / new / strong candidate / needs review / called / no answer / booked.
- **Search** by name or any part of the phone number.
- **One tap to call** (`tel:`), **one to WhatsApp**, one to copy the number.
- **Status** per lead (new → called → no answer → booked → not eligible → declined) and a
  **notes** box; both save straight back to the Sheet, notes after a short pause.
- Leads that declared a contraindication carry a red banner saying to route them to a
  clinician rather than close them.
- Refreshes itself every minute, and won't interrupt someone mid-note.

Everything the console writes lands in the same Sheet, so the Sheet stays the source of truth
and anyone can still work in it directly. Only `status` and `notes` are writable from the
browser — what the patient submitted can't be edited from the console.

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
