# Saleem Performance Lab

A single-file dashboard for Saleem's orders by service, with MoM/YoY comparisons, Meta ad spend, holidays and events.

Open `dist/saleem-performance.html` in a browser. It needs internet only for the chart library and fonts.

## Modules

The page has ten modules, switched with the tabs in the header (Data is the button at the right): Overview, Month by month, Services, Patients, Providers, Service links, Meta ads, Calendar (holidays and events), Projections, and Data. The filter bar is one row: date range, services, measure and By; Dates by, visit status, New patient and Ad spend are under More filters. Earlier order: Overview, Month by month, Services, Providers, Service links, Patients, Meta ads, Projections, Holidays & events, and Data (drag-and-drop loading of the orders and unique patients exports). The filter bar applies to all of them (Projections ignores the date range and always projects from the latest day in the data).

Source code is split the same way under `src/`: `layout.html` and `styles.css` for the page, and one file per module in `src/js/` (`m_overview.js`, `m_projections.js`, …) plus shared helpers (`core.js`, `data.js`, `state.js`, `filters.js`, `charts.js`, `main.js`). `build.py` stitches them into the single file in `dist/`.

## Projections

Built from the factors ticked in "What goes into the projection"; every row shows what it measured in the data and how much it changes the next 30 days to 1 year.

- Patterns: weekday pattern (last 12 weeks of orders, each weekday against the average day, shrunk 30% toward even), holidays (each holiday against the same weekdays in the 4 weeks around it, from the last year, 2 years or all years), last year's seasonal shape (last year's weeks against last year's own trend, at half strength), and upcoming events in the Outside Factors sheet (at the measured effect of their category).
- Growth: trend (weighted line through 26 weeks), year over year, month over month, week over week, a custom period over period, and your own rate. The ticked rates are averaged into one monthly rate, which either holds (constant) or fades (slowing, about half every 10 weeks).
- Forecast = level of the last 28 days (patterns removed) × growth × seasonal shape × weekday × holiday × events.
- The chart and table follow By in the filter bar (day, week or month). The likely range and "typical error" come from re-running the same mix at 8 earlier dates; sheet events are left out of those checks since sudden events aren't known in advance.
- On the data to 23 Sep 2026 the default mix (weekday, holidays, events, trend, year over year) missed by about 3% over 28 days; adding last year's seasonal shape made it about 5%, so it is off by default.

## Service links

The Service links module uses the services picked in the filter bar. With 2 or 3 selected it shows:
- their weekly volume on one indexed scale
- whether week-to-week changes in one are followed by changes in the other, and after how many weeks
- one service per 100 of the other, by month

With more than 3 selected it shows a grid of every pair. The patient-level view (same patient, second service within 7 or 30 days) needs the export from `sql/service_followon_monthly.sql`, loaded in the Data tab.

## Providers and doctor specialties

Needs the provider export (`sql/provider_orders_daily.sql`, dropped on the Providers box in the Data tab). One row per day, service, visit status and provider for doctor visits, nursing and physiotherapy, dated by scheduled time. The Providers module follows the filter bar and shows active providers, the top-5 share, a sortable table of each provider against the previous period and last year, the busiest providers over time, active providers per service, and doctor visits by specialty.

The specialty column isn't in the schema notes yet: the query returns it empty until `NULL::text AS specialty` is replaced with the real column (the query's comment has an `information_schema` search to find it).

In Service links, "What inside a service moves the others?" tests each doctor specialty and the busiest doctors, nurses and physiotherapists against the other selected services at 0–4 weeks' lag. "Strong" is corrected for every pair and lag tested (Bonferroni); "possible" is the single-test 5% bar.

All lag tests (services, ad spend, drivers) shrink the number of weeks with Bartlett's correction, because week-over-week changes swing back and forth and would otherwise pass the bar by chance too often.

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

## Refreshing

- Quick: open the **Data** tab and drag the Metabase orders export onto the Orders box (or click it to choose the file). Choose *Add or update days* to merge with what's there or *Replace everything*. The unique patients export goes on the Patients box. Loaded files are kept in your browser until the page is rebuilt. Ads and events CSVs can still be loaded with **Load CSV** in the header.
- Permanent: replace the files in `data/` and run `python3 build.py`.

## How numbers are calculated

- Main measure is `distinct_orders`; cancelled orders are excluded unless the Cancelled status is switched on.
- Previous period = same number of days just before the range. Last year = the range shifted back 364 days so weekdays match.
- Month table MoM/YoY compares orders per day, so short months and the current partial month compare fairly.
- Ads are matched to services one by one: the ad's code (PT, NS, DRV, LT, US, OLC, TX, GA…), then words in the ad name, ad set name and campaign name; recruitment, app-install and awareness campaigns keep their own groups.
- Daily ad spend by service = each ad's monthly spend spread over the month in proportion to the account's daily spend.
- Holiday effects compare each holiday with the same weekdays in the four weeks before and after, skipping other holidays.
