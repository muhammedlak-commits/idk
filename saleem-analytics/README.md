# Saleem Performance Lab

A single-file dashboard for Saleem's orders by service, with MoM/YoY comparisons, Meta ad spend, holidays and events.

Open `dist/saleem-performance.html` in a browser. It needs internet only for the chart library and fonts.

## Modules

The page has eight modules, switched with the tabs under the header: Overview, Month by month, Services, Patients, Meta ads, Projections, Holidays & events, and Data (drag-and-drop loading of the orders and unique patients exports). The filter bar applies to all of them (Projections ignores the date range and always projects from the latest day in the data).

Source code is split the same way under `src/`: `layout.html` and `styles.css` for the page, and one file per module in `src/js/` (`m_overview.js`, `m_projections.js`, …) plus shared helpers (`core.js`, `data.js`, `state.js`, `filters.js`, `charts.js`, `main.js`). `build.py` stitches them into the single file in `dist/`.

## Projections

For the selected services and statuses: measured holiday effects are removed, a weekday pattern is taken from the last 12 weeks, and a weighted trend line is fitted to the last 26 weeks. The forecast puts those back together for the chosen horizon, with a choice of growth assumption (slowing trend, continuing trend, no growth, or a custom monthly %). The likely range comes from re-running the model at eight earlier dates and comparing with what actually happened.

## Sample files

`samples/` has an example of each export the Data tab accepts (`saleem-orders-sample.csv`, `saleem-unique-patients-sample.csv`). The Data tab shows the same samples with a column-by-column guide.

## Data (`data/`)

| File | Source | Grain |
|---|---|---|
| `services_daily.csv` | Metabase service performance export | day × service × visit status |
| `meta_ads_daily.csv` | Meta Ads, Saleem Ad Account (USD) | day, account total |
| `meta_ads_campaign_monthly.csv` | Meta Ads | month × campaign |
| `campaign_service_map.csv` | Campaign name → service group (edit the `ad_group` column to correct it) | campaign |
| `events.csv` | Political, economic and marketing events | event |

Holidays are computed in the page from the Umm al-Qura Hijri calendar plus Iraq's fixed public holidays.

## Refreshing

- Quick: open the **Data** tab and drag the Metabase orders export onto the Orders box (or click it to choose the file). Choose *Add or update days* to merge with what's there or *Replace everything*. The unique patients export goes on the Patients box. Loaded files are kept in your browser until the page is rebuilt. Ads and events CSVs can still be loaded with **Load CSV** in the header.
- Permanent: replace the files in `data/` and run `python3 build.py`.

## How numbers are calculated

- Main measure is `distinct_orders`; cancelled orders are excluded unless the Cancelled status is switched on.
- Previous period = same number of days just before the range. Last year = the range shifted back 364 days so weekdays match.
- Month table MoM/YoY compares orders per day, so short months and the current partial month compare fairly.
- Daily ad spend by service = each campaign's monthly spend spread over the month in proportion to the account's daily spend.
- Holiday effects compare each holiday with the same weekdays in the four weeks before and after, skipping other holidays.
