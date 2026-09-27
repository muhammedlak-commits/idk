# Saleem Performance Lab

A single-file dashboard for Saleem's orders by service, with MoM/YoY comparisons, Meta ad spend, holidays and events.

Open `dist/saleem-performance.html` in a browser. It needs internet only for the chart library and fonts.

## Modules

The page has nine modules, switched with the tabs under the header: Overview, Month by month, Services, Service links, Patients, Meta ads, Projections, Holidays & events, and Data (drag-and-drop loading of the orders and unique patients exports). The filter bar applies to all of them (Projections ignores the date range and always projects from the latest day in the data).

Source code is split the same way under `src/`: `layout.html` and `styles.css` for the page, and one file per module in `src/js/` (`m_overview.js`, `m_projections.js`, …) plus shared helpers (`core.js`, `data.js`, `state.js`, `filters.js`, `charts.js`, `main.js`). `build.py` stitches them into the single file in `dist/`.

## Projections

For the selected services and statuses: measured holiday effects are removed, a weekday pattern is taken from the last 12 weeks, and a weighted trend line is fitted to the last 26 weeks. The forecast puts those back together for the chosen horizon, with a choice of growth assumption (slowing trend, continuing trend, no growth, or a custom monthly %). The likely range comes from re-running the model at eight earlier dates and comparing with what actually happened.

## Service links

The Service links module uses the services picked in the filter bar. With 2 or 3 selected it shows:
- their weekly volume on one indexed scale
- whether week-to-week changes in one are followed by changes in the other, and after how many weeks
- one service per 100 of the other, by month

With more than 3 selected it shows a grid of every pair. The patient-level view (same patient, second service within 7 or 30 days) needs the export from `sql/service_followon_monthly.sql`, loaded in the Data tab.

## Outside factors (Google Sheet)

Events live in the Google Sheet **Saleem Outside Factors** (id in `data/sheet.json`). When the dashboard is opened in claude.ai it reads the sheet through the viewer's Google Drive connector, on open and every 10 minutes. Without the connector it shows the last copy it read in that browser, then `data/events.csv`. Columns: start, end, category, title, scope, status, source, notes. Official holidays in the sheet are for reference; the dashboard draws them from the Hijri calendar. Sudden holidays, salary windows, security, political and economic events are measured in the Holidays & events module.

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
