# Saleem Performance Lab

A single-file dashboard for Saleem's orders by service, with MoM/YoY comparisons, Meta ad spend, holidays and events.

Open `dist/saleem-performance.html` in a browser. It needs internet only for the chart library and fonts.

## Layout

Four sections, plus **Data & settings** at the right of the header.

- **Summary:** what changed in the period and why. It has a written answer, four tiles (the measure, company revenue, returning-patient orders, cancellations), the waterfall, a "Worth your attention" list the page works out itself, and where the change landed.
- **Performance:** the trend (the 12 months to the end of the range, or the range itself), each month against its usual move, and one table by service (five columns; *More columns* for the rest) or by month.
- **Drivers:** one card per driver with a one-line answer, then the detail for Patients, Providers, Service links, Meta ads or Calendar.
- **Plan:** projections.

The line under the header says in plain words what every number shows. Examples: the measure, services, dates, what each period is judged against, dates by, how last year lines up, and any statuses left out. *Change* opens the controls; *More settings* holds the rest.

Colours follow one rule: navy for this period, grey for the comparison, green for better than usual, orange for worse. Method notes sit behind "How this is worked out". The page opens on the last complete month. Old tab links (`#monthly`, `#providers`, …) still land in the right place.

Source code is split the same way under `src/`: `layout.html` and `styles.css` for the page, and one file per module in `src/js/` (`m_overview.js`, `m_projections.js`, …) plus shared helpers (`core.js`, `data.js`, `state.js`, `filters.js`, `charts.js`, `main.js`). `build.py` stitches them into the single file in `dist/`.

## What changed

The opening tab. It compares the date range with the period before it (or the same days last year) for the services, statuses, measure and patient view picked above, with quick buttons for the last month, last 4 weeks and last 3 months.

- **Why**, as a waterfall that adds up to the real change:
  1. Weekdays and holidays: each period's expected level from the usual weekday shares (last year, holiday days left out) and each holiday's measured past effect.
  2. Outside events: sheet events at their category's measured effect.
  3. Meta ads: the change in matching spend times the link between weekly spend and this measure over the past year. It counts only when that link passes the 5% bar (Bartlett-corrected), and the elasticity is capped at 0 to 1.
  4. Everything else: what those three don't explain.

  Each step applies to what the previous steps leave.
- **Where it landed**: the change by service, new vs returning patients, provider and doctor specialty (providers use orders when a money measure is picked).
- A short written summary sits on top.
- These are estimates. An event in the period counts toward its own category's average. The ads step shows timing, not proof.

## Last year and the usual move

Because Saleem grows fast, a year-over-year count is nearly always a big positive number. The dashboard leads with the **usual move** instead. It takes this period's change against the period before it, and subtracts the change over the same pair of periods a year earlier. With two earlier years, it uses the average of both.

- **Last year lines up by Hijri date** by default (More filters › Last year lines up by). The same Hijri day a Hijri year back is 354 or 355 days earlier, so Ramadan, the Eids and Arbaeen line up. *Same weekdays* uses 364 days instead.
- **Both years are adjusted first.** Each is divided by its calendar index: weekday shares times each holiday's measured effect.
- **Small years are left out.** An earlier year under a quarter of this year's size doesn't count, because start-up growth isn't a season.
- **Where it shows:**
  - the Overview hero tile's "vs usual" chip
  - the Services table's *vs usual move* column
  - the Monthly table's *vs usual move* mode
  - What changed › *vs usual move*, which adds a "usual move" step to the waterfall

  The plain year-over-year figure stays as a small number.
- **Why the alignment matters:** on the data to 28 Sep 2026, the usual July-to-August move was −4.1% aligned by Hijri date and −13.4% by weekdays. Arbaeen fell in last August's window.

## Sales and revenue

The orders queries also return `sales_iqd`, the services' `finalPriceAmount`, with tagged orders included. They return `company_revenue_iqd` too: sales minus all ten provider revenue shares (override amount, else calculated amount). Both come in new-patient versions. With those columns, the measure switch gets Sales and Revenue, which every orders-based tab follows. Provider, gateway and follow-on exports stay counts.

## Projections

Built from the factors ticked in "What goes into the projection"; every row shows what it measured in the data and how much it changes the next 30 days to 1 year.

- Patterns: weekday pattern (last 12 weeks of orders, each weekday against the average day, shrunk 30% toward even), holidays (each holiday against the same weekdays in the 4 weeks around it, from the last year, 2 years or all years), last year's seasonal shape (last year's weeks against last year's own trend, at half strength), and upcoming events in the Outside Factors sheet (at the measured effect of their category).
- Growth: trend (weighted line through 26 weeks), year over year, month over month, week over week, a custom period over period, and your own rate. The ticked rates are averaged into one monthly rate, which either holds (constant) or fades (slowing, about half every 10 weeks).
- Forecast = level of the last 28 days (patterns removed) × growth × seasonal shape × weekday × holiday × events.
- The chart and table follow By in the filter bar (day, week or month). The likely range and "typical error" come from re-running the same mix at 8 earlier dates; sheet events are left out of those checks since sudden events aren't known in advance.
- On the data to 23 Sep 2026 the default mix (weekday, holidays, events, trend, year over year) missed by about 3% over 28 days; adding last year's seasonal shape made it about 5%, so it is off by default.

## Service links

Service → service and Specialties & providers use the **From** and **To** services picked at the top of the module, not the filter bar (which still sets statuses, patient view and measure). Several services on one side are added together. Swap flips the direction. For Service → service it shows:
- From and To's weekly volume on one indexed scale, with a written read-out (trend of each, the mix, timing, weeks they pulled apart, the last four weeks)
- whether week-to-week changes in From are followed by changes in To, and after how many weeks
- To per 100 From, by month (months with under a week in the period left out)
- the patient-level view (same patient, a To service within 7 or 30 days of a From service), which needs `sql/service_followon_monthly.sql`

It has its own period (12, 26 or 52 weeks, all data or the date range). **Compare two periods** puts period A (last 4 weeks, this month so far, last full month, or custom) against period B: From and To a day, To per 100 From, the change in To split into From's volume and the To-per-From rate, and, with the provider exports, which From providers and specialties the change came from (patients seen, share going on to To, split into volume and rate). **Every pair** shows a grid of every pair among the services picked in the filter bar instead.

## Providers and doctor specialties

Needs the provider export (`sql/provider_orders_daily.sql`, dropped on the Providers box in the Data tab). One row per day, service, visit status and provider for doctor visits, nursing and physiotherapy, dated by scheduled time. The Providers module follows the filter bar and shows active providers, the top-5 share, a sortable table of each provider against the previous period and last year, the busiest providers over time, active providers per service, and doctor visits by specialty.

Specialty comes from `DoctorInfo.speciality`, joined on the doctor's user id (one row per doctor, so counts never double) in the provider, provider follow-on and gateway queries. It is empty for nurses and physiotherapists, and shown with a capital and spaces (internist → Internist).

In Service links, "What inside a service moves the others?" tests each doctor specialty and the busiest doctors, nurses and physiotherapists against the other selected services at 0–4 weeks' lag. "Strong" is corrected for every pair and lag tested (Bonferroni); "possible" is the single-test 5% bar.

All lag tests (services, ad spend, drivers) shrink the number of weeks with Bartlett's correction, because week-over-week changes swing back and forth and would otherwise pass the bar by chance too often.

## Gateway providers and retention

Needs the gateway export (`sql/gateway_provider_monthly.sql`, Data tab). For every patient, the gateway is the provider on their first-ever real visit (doctor, nurse or physiotherapist; lab tests and imaging usually show No named provider). The Providers module shows, for the services and months in the filter bar, each gateway provider's new patients, their share of that first service, the share back within 30, 90 and 180 days (only patients whose window has passed count), further orders per patient in 90 days, how many tried another service, and how many saw the same provider again. New patient means (first order or account created) picks the cohort month.

**What each gateway's patients ordered next** needs a second export, `sql/gateway_next_services_monthly.sql`. For each gateway provider it shows the share of their new patients who had each service within 30, 90 or 180 days of the first visit (as a %, as patients, or as orders in 90 days), coloured against the other gateways with the same first service. A cell is marked worth checking when it passes Benjamini–Hochberg at 10% across every cell tested (20+ patients on both sides). Clicking a row draws that gateway against its peers, service by service. Other services in the first order count as next services, and the first service counts again when it returns in a later order.

## Provider follow-on and busy weeks

In Service links › Specialties & providers:

- **Patient follow-on** (needs `sql/provider_followon_monthly.sql`): of the patients each doctor, nurse or physiotherapist saw (From), the share who had one of the To services within 7 and 30 days, for example lab tests after a doctor or nurse visit.
- **Busy weeks** (uses the provider export): weeks when a provider took an unusually large share of their service (their own top 20%), and whether the other selected services grew faster in the 2 or 4 weeks after than after the provider's other weeks (Welch t-test, overlap-adjusted).
- The lag table of specialties and top providers against the other services stays below.

Both provider comparisons use the median provider of the same service as the benchmark, with an overdispersion correction (funnel-plot style), because comparing with "all the others pooled" let one dominant provider make every colleague look significantly worse. With only one or two providers they fall back to the others pooled. "Strong" is Bonferroni-corrected across every row tested; "possible" is the usual 5% bar.

## Ad spend switch

The **Ad spend** switch in the filter bar decides which ads count as spend in every module: *Matching ads* (ads matched to the selected services, the default), *All ads*, or *Pick ad groups* (a row of ad-group chips). Orders always follow the service chips. Cost per order is labelled with the mode. In the Services table each row stays on matching ads; the All selected row follows the switch.

The Service links module uses it to test one ad group against another service's orders: weekly spend and weekly orders on separate charts, correlation of week-over-week changes at 0–4 weeks' lag with a 5% and a 1% bar, and the ads with the most spend in the weeks where the link shows up.

## Outside factors and competitors (Google Sheet)

The Google Sheet **Saleem Outside Factors** (settings in `data/sheet.json`) has two tabs, read through the viewer's **Google Sheets** connector (`get_values`, every row) when the dashboard is opened in claude.ai, and every 10 minutes while it is open. Google Drive's file reader isn't used: it returns only a sample of a sheet's rows. Without the connector the page shows the last copy it read in that browser, then `data/events.csv` and `data/competitors.csv`.

- **Events**: start, end, category, title, scope, status, source, notes. Official holidays in the sheet are for reference; the dashboard draws them from the Hijri calendar. Sudden holidays, salary windows, security, political and economic events are measured in the Calendar module and can feed the projections.
- **Competitors**: date, end, competitor, milestone, type, services, city, status, source, notes. Shown as diamonds on the Overview charts (Competitors toggle) and listed in the Calendar module with the change in orders over the 4 weeks after each milestone against the usual 4-week change. Rows with status Dropped are ignored.

## Patient views

All patients / New / Returning in the filter bar applies to every module that uses the orders data. It needs the six `new_*` columns of the current orders export (`sql/orders_daily_by_*.sql`): New follows **More filters › New patient means** (first order with Saleem in that month, or patient record created that month); Returning is all minus new. With an older export the switch stays on All.

## Scheduled time vs booking time

By default every order counts on its **scheduled time** (the visit date). The **Dates by** switch in the filter bar shows the same dashboard by **booking time** (the day the order was created) instead. The two need separate exports with the same columns:

- `sql/orders_daily_by_scheduled_time.sql`: started, finished, reviewed and cancelled visits, up to today.
- `sql/orders_daily_by_booking_time.sql`: also includes orders still waiting for their visit (status *scheduled*).

In the Data tab, choose *This file is dated by: Booking time* before dropping the booking-time file. To embed it permanently, save it as `data/services_daily_booked.csv` and run `python3 build.py`. The unique patients export always uses scheduled time.

## Sample files

`samples/` has an example of each export the Data tab accepts (`saleem-orders-sample.csv`, `saleem-unique-patients-sample.csv`). The Data tab shows the same samples with a column-by-column guide.

## Data (`data/`)

| File | Source | Grain |
|---|---|---|
| `services_daily.csv` | Metabase service performance export | day × service × visit status |
| `meta_ads_daily.csv` | Meta Ads, Saleem Ad Account (USD) | day, account total |
| `meta_ads_campaign_monthly.csv` | Meta Ads | month × campaign |
| `meta_ads_ad_monthly.csv` | Meta Ads, every ad with spend | month × ad |
| `ad_service_map.csv` | Ad → service group, made by `python3 map_ads.py` (edit `ad_group` and set `matched_by` to `manual` to correct one; manual rows are kept) | ad |
| `campaign_service_map.csv` | Campaign name → service group, used only when the ad-level file is missing | campaign |
| `events.csv` | Political, economic and marketing events | event |

Holidays are computed in the page from the Umm al-Qura Hijri calendar plus Iraq's fixed public holidays.

## Is each export complete?

Every box in Data & settings says whether its export is complete, needs a new upload, or isn't loaded, and the Data & settings button shows how many need one. An export needs a new upload when it lacks a column the current query has (its sample file lists them), when its specialty column is there but empty (made before specialty was added), or when it's out of date: a daily export more than 3 days behind today, or a monthly one without the current month.

## Column explanations

Every table header shows a short explanation on hover (a long press on phones), from one glossary in `src/js/m_tips.js`. A table-specific entry wins over a general one, and a header that sets its own explanation keeps it. A MutationObserver applies them as tables are drawn, so a new table only needs glossary entries.

## Saved uploads

In claude.ai, every export loaded in Data & settings (or with Load CSV) is saved with the dashboard: the file as an asset of the artifact, and a `saved/<export>` document pointing at it. On open the page loads the saved files over the built-in data, so they survive new versions of the page and open on any device. Only people who can edit the dashboard save files; everyone it's shared with sees them. Remove loaded data deletes the saved copy, and loading a newer file replaces it. When a later version of the page ships different built-in data for an export, the built-in data is used and the saved copy is listed as not used. Outside claude.ai, files stay in the browser as before.

## Refreshing

- Automatic: `automation/metabase_to_sheet.gs` copies saved Metabase questions into `data_…` tabs of the Saleem Outside Factors sheet every 6 hours. Opened in claude.ai, the page reads those tabs live. A tab's copy is used unless a file was loaded by hand after that tab's last refresh. Setup is in `automation/README.md`.

- Quick: open the **Data** tab and drag the Metabase orders export onto the Orders box (or click it to choose the file). Choose *Add or update days* to merge with what's there or *Replace everything*. The unique patients export goes on the Patients box. Loaded files are kept in your browser until the page is rebuilt. Ads and events CSVs can still be loaded with **Load CSV** in the header.
- Permanent: replace the files in `data/` and run `python3 build.py`.

## How numbers are calculated

- Main measure is `distinct_orders`; cancelled orders are excluded unless the Cancelled status is switched on.
- Services: a doctor visit (or booking) of 500,000 IQD or more is a surgery; an internist's doctor visit under 100,000 IQD is a follow-up visit (`followUp`), kept apart so first visits and follow-ups can be read separately. The Doctor visit ad group covers both.
- Compare with (in the date picker): Fairest by default. A range that starts on the 1st within one month is compared with the same days last month; any other range with the same number of days just before it. Same days last month, the days just before, and same dates last year (shifted 364 days so weekdays match) can be picked. When the two periods differ in length, percentage moves are scaled to the same number of days.
- Month so far: Summary, Performance, Drivers › Patients, Providers and Meta ads open with this month from the 1st to the latest day, against the same days last month and last year.
- Month table MoM/YoY compares orders per day, so short months and the current partial month compare fairly.
- Ads are matched to services one by one: the ad's code (PT, NS, DRV, LT, US, OLC, TX, GA…), then words in the ad name, ad set name and campaign name; recruitment, app-install and awareness campaigns keep their own groups.
- Daily ad spend by service = each ad's monthly spend spread over the month in proportion to the account's daily spend.
- Holiday effects compare each holiday with the same weekdays in the four weeks before and after, skipping other holidays.
