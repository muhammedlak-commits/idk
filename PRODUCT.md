# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Saleem serves people in Iraq who cannot easily get to a clinic, or would rather not:

1. Individuals with limited mobility or a chronic illness who need consistent follow-up.
2. Families arranging care for an elderly or sick relative.
3. Patients looking for an affordable alternative to a hospital visit.
4. Corporate partners providing healthcare benefits to employees.

Most first contact happens on a phone, often over a slow Iraqi mobile connection, and in
Arabic. Booking is conversational: the patient shares name, age, address and condition over
WhatsApp or a call.

**Ozempic® program surface (this repo's funnel):** adults 18+ in Iraq looking for
medically supervised weight loss, many with type-2 diabetes or a weight-related condition.
Their job on the page is to find out, privately and quickly, whether they are likely to
qualify, and to book a free call. Many arrive from Meta ads. Saleem's call-centre staff are a
second audience: they work the resulting leads from a phone-friendly console.

## Product Purpose

Saleem is an Iraqi cloud-based healthcare platform that brings the clinic to the patient — at
home, at work, in a hotel, anywhere. It exists because Iraqi patients struggle to reach
clinics during working hours, chronic patients need follow-up the traditional system can't
easily give, employees lose work time to appointments, and post-treatment plans are hard to
manage without support.

Mission: deliver high-quality, flexible healthcare to individuals and organizations across
Iraq. Vision: make home-based healthcare a new culture and the foundation of Iraqi
healthcare's future.

Success for the Ozempic® funnel is a completed eligibility assessment that becomes a callable
lead, routed correctly (safety cases to a clinician, never to a sales close).

## Positioning

Licensed medical care delivered to wherever the patient is, across Baghdad, close to around
the clock — not a booking directory and not a pharmacy. For the Ozempic® program specifically:
the medication comes with a real medical assessment, a licensed doctor's prescription,
dose titration, in-home nurse injection training and monthly follow-up, rather than being sold
over the counter.

## Operating Context

- Operates nearly 24/7, including weekends and holidays; covers all of Baghdad including
  remote areas, and is expanding beyond it.
- Services: home doctor visits (board-certified specialists across major fields), home
  nursing (1–2 hr response, both genders), home physiotherapy, home lab tests, home
  echocardiogram, ECG, X-ray and ultrasound, telemedicine (including psychiatry and CBT),
  ambulance, and international referral to partner hospitals in Turkey, India and Jordan.
- Partners with hospitals, labs and clinics for extended services.
- Booking is by WhatsApp or phone. WhatsApp is a primary channel, not a fallback.
- **Ozempic® funnel flow:** landing page → 4-question eligibility quiz → result band
  (`Likely` / `Possible` / `Review` / `Unlikely`) → contact form → lead posted to a Google
  Apps Script that writes a Google Sheet → call-centre staff work it from the Apps Script
  console (`saleem-ozempic-funnel/apps-script/Admin.html`). The first call comes from
  Saleem's trained medical team (pharmacists and junior doctors), not the prescriber.

## Capabilities and Constraints

- **Bilingual, Arabic first.** Arabic RTL and English LTR, with a language toggle. Layout
  mirrors through CSS logical properties; Arabic-Indic numerals are display-only, and data is
  always Latin digits.
- **Ozempic® funnel stack:** one static `index.html` (inline CSS/JS, no framework, no build
  step), assembled into `dist/` by `build-dist.sh` and deployed on Netlify. All copy lives in
  the `T.ar` / `T.en` dictionaries. See `saleem-ozempic-funnel/README.md`.
- **Free/paid line is fixed.** Only the online assessment and the medical-team call are free.
  The full medical assessment and prescription, titration, nurse injection training, monthly
  follow-up, nutrition consult, and the medication itself are in the paid program. Price is
  set after the call by dose; no published price yet (`CONFIG.priceIqd = 0`).
- **Prescription-only medication.** No surface may promise a prescription or imply approval;
  every result says a clinician decides. The contraindication screener routes to `Review`
  and still captures the lead — it is not a hard decline. Under-18s are gated out.
- **Patient data is sensitive.** Leads carry health data (BMI, conditions, contraindications)
  plus name and phone. The source folder holds the staff allowlist and access key and must
  never be published; only `dist/` is deployed.
- **Open decisions:**
  - Novo Nordisk relationship is **unconfirmed**. The "In partnership with" co-brand bar, the
    Novo Nordisk logo, and the line "New patient slots are limited each month by medication
    supply" all need verification and sign-off before launch.
  - Real program pricing (`CONFIG.priceIqd`).
  - Fonts are still loaded from Google Fonts; self-hosting is pending.

## Brand Commitments

- Name: **Saleem** (سليم); legal entity المستقبل السليم for Healthcare Services LLC.
- Tagline: *Welcome To The New Era Of Healthcare. Welcome Saleem.*
- Wordmark: `saleem-ozempic-funnel/assets/logo-saleem.png` (transparent).
- Voice on the Ozempic® funnel: plain, warm, Iraqi-Arabic register; honest about
  contraindications ("this program isn't for everyone"); never hype a prescription.
- Medical wording: the first-call team is "الفريق الطبي / the medical team", never "a Saleem
  doctor calls you". Ozempic® keeps its ® and the Novo Nordisk trademark notice.

## Evidence on Hand

- Team: 100+ licensed doctors, 30+ nurses, 40+ physiotherapists.
- Service facts: nursing 1–2 hr response; ~70% of lab results same day; ECG results in 2–4
  hrs; physiotherapy 50,000–60,000 IQD per session.
- Product photography: `saleem-ozempic-funnel/assets/ozempic-hero.webp`,
  `ozempic-hand.webp`, `ozempic-doses.webp` (0.25 / 0.5 / 1 mg pens).
- **Not evidence — do not repeat:** "based on average results across 1,000 patients on the
  program" (used in `demo.note` and `res.note` in `index.html`) is a placeholder, not real
  Saleem data. Future work must not reuse it, and the existing copy needs replacing, for
  example with a clearly cited published-trial average.
- **Absent:** patient testimonials, before/after results, case studies, press, and Saleem
  outcome data for the Ozempic® program. Do not fabricate any of them.

## Product Principles

1. **Care comes to the patient.** Every flow should cut trips, queues and waiting, and work on
   a phone, in Arabic, on a weak connection.
2. **Medical honesty over conversion.** Never imply approval, a prescription or a result the
   clinician hasn't confirmed; route safety cases to clinicians, not closers.
3. **Free means exactly what it says.** State the free/paid line once and keep it identical
   everywhere it appears.
4. **Every question must earn its tap.** Ask the patient only what changes the outcome; the
   rest belongs in the call.
5. **Claims need proof on hand.** Numbers, partnerships and scarcity lines ship only when
   they're verified.

## Accessibility & Inclusion

- Arabic RTL is the primary reading direction; both languages must be complete (a missing key
  renders as its name).
- Honor `prefers-reduced-motion`.
- Users skew toward older and chronically ill patients and their family caregivers, so small
  tap targets and low-contrast text are real barriers. No formal WCAG level has been set.
