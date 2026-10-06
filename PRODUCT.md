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

**Saleem Store surface (`saleem-store/`):** patients and, more often, the family member
caring for them, buying home medical supplies (mobility aids, beds and mattresses, oxygen,
dressings, continence and diabetes supplies) to buy, rent by the month, or have refilled
monthly. Many come after a Saleem doctor, nursing, physio or lab visit that created the
need, so the shop is organised by the patient's need, not by product type. Clinics and
centres are a smaller audience, ordering professional items by quote. Saleem staff are the
operators: they run the catalogue, partner stores, orders and commission from the admin
portal (`saleem-store/admin.html`). Partner stores will later need to see their own
orders and statements, but they do not log in yet.

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

Success for the Saleem Store is an order sent on WhatsApp that becomes a delivered order,
with Saleem's commission recorded against the partner store that supplied it.

## Positioning

Licensed medical care delivered to wherever the patient is, across Baghdad, close to around
the clock — not a booking directory and not a pharmacy. For the Ozempic® program specifically:
the medication comes with a real medical assessment, a licensed doctor's prescription,
dose titration, in-home nurse injection training and monthly follow-up, rather than being sold
over the counter.

For the Saleem Store: a supplies shop run by a home-care provider. It is organised around
what Saleem's own clinicians ask for after a visit, it offers ready-made care kits, and a
nurse answers questions on WhatsApp. A plain pharmacy or equipment seller can't truthfully
claim that link to the care plan.

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
- **Saleem Store flow:** the customer browses the shop, builds an order (each item can be
  bought, rented monthly, refilled monthly, or quoted for a clinic), and sends it with name,
  phone, area and payment choice as one WhatsApp message carrying an order number. Saleem's
  team confirms price, stock and delivery in the chat; nothing is paid online. With the
  Google Sheet backend connected, the same order is logged for staff (status, final prices,
  commission per store, refill reminders that staff send from WhatsApp with a one-tap
  reorder link).
- **Store money flow:** products come from partner stores (medical-equipment shops and
  pharmacies in Baghdad). A delivery company, not Saleem, delivers and collects payment on
  delivery (cash or the enabled wallets: ZainCash, Qi Card, FastPay). It pays Saleem, and
  Saleem pays each partner store its share minus Saleem's commission. Commission is a % set
  per store, with optional per-item overrides, taken on the delivered line total after any
  bulk discount.

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
- **Saleem Store stack:** static pages, with no framework and no build step:
  - `index.html` (the shop), `admin.html` (the portal) and `supplies.html` (the internal
    buying list).
  - Shared data in `data/products.js` and `data/site.js`; settings in `config.js`.
  - It runs off disk or from any static host. `build-dist.sh` publishes only the shop.
  - An optional Google Apps Script plus Sheet (`saleem-store/apps-script/`) becomes the live
    catalogue, order log and photo store.
  - See `saleem-store/README.md`.
- **Store catalogue:** 224 items in 14 need-based departments plus a quote-only "For
  clinics" section. Each item has an internal priority tier (1 = the care plan breaks
  without it), which sorts the shop and is never shown to customers. Product ids are stable
  and must never be reused: saved baskets, reorder links and order messages point at them.
- **Store switches set by staff:**
  - Rentals: on or off for the whole shop.
  - Each payment method.
  - Delivery promise and fee (currently "1–2 days").
  - Ask-our-nurse, with its own WhatsApp number.
  - The "Help me choose" finder.
  - Care kits.
  - The clinics section and bulk-quantity discount tiers.
  - Refill reminders.
  - Showing "Supplied by" on product pages.
  - Home banners (ads, schedulable, each a single link).
- **Commission is private.** Store commission % and store contacts live only in
  `saleem-store/private/commercial.js` (never deployed; the build refuses to publish it) or
  in the Sheet's private columns. They never appear in the public catalogue, the shop or a
  file a partner could see. The admin's bulk spreadsheet and the standalone admin file
  carry them, so they stay with staff.
- **Admin access:** a shared 6-digit code. The page-side check only hides the page. The real
  protection is the same code checked by the Apps Script on every save, with a lockout after
  8 wrong tries. Staff only for now.
- **Open decisions (store):**
  - No partner stores are signed yet. The catalogue is a target list, not real stock, and
    no item has a confirmed price.
  - The delivery company is not named.
  - Hosting and the store's public address (needed for reminder links) are undecided.
  - The store's own WhatsApp line: orders currently go to the Ozempic funnel's number.
  - Product photos are placeholders (Bing image search) until real ones are uploaded.
  - A partner-store login to see their own orders and statements is planned, not built.

## Brand Commitments

- Name: **Saleem** (سليم); legal entity المستقبل السليم for Healthcare Services LLC.
- Tagline: *Welcome To The New Era Of Healthcare. Welcome Saleem.*
- Wordmark: `saleem-ozempic-funnel/assets/logo-saleem.png` (transparent).
- Voice on the Ozempic® funnel: plain, warm, Iraqi-Arabic register; honest about
  contraindications ("this program isn't for everyone"); never hype a prescription.
- Medical wording: the first-call team is "الفريق الطبي / the medical team", never "a Saleem
  doctor calls you". Ozempic® keeps its ® and the Novo Nordisk trademark notice.
- Voice on the Saleem Store: plain Iraqi-Arabic register, practical and reassuring. Say
  "our team confirms price and delivery on WhatsApp"; never promise stock, a price or a
  delivery time the team hasn't confirmed.

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
- Store catalogue copy: the 224 product names (Arabic and English) and the "why a patient
  needs it" lines in `saleem-store/data/products.js` came from Saleem's own supplies list.
  Six example care kits are in `saleem-store/data/site.js`.
- Store imagery: `saleem-store/assets/hero-supplies.webp` and the Saleem wordmark. Product
  thumbnails are Bing reference images, not licensed and not Saleem stock. Never present
  them as real product photos.
- **Absent (store):** real prices, partner-store names, customer reviews, delivery-time data
  and order volumes. Do not invent them.

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
6. **Commercial terms stay private.** Commission rates and partner contacts never reach a
   customer-facing or partner-facing surface.

## Accessibility & Inclusion

- Arabic RTL is the primary reading direction; both languages must be complete (a missing key
  renders as its name).
- Honor `prefers-reduced-motion`.
- Users skew toward older and chronically ill patients and their family caregivers, so small
  tap targets and low-contrast text are real barriers. No formal WCAG level has been set.
