# Saleem Performance Lab

A single-file dashboard for Saleem's orders by service, with MoM/YoY comparisons, Meta ad spend, holidays and events.

Open `dist/saleem-performance.html` in a browser. It needs internet only for the chart library and fonts.

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

- Quick: click **Load CSV** in the dashboard and pick a newer Metabase export (same columns). New days replace old ones. Ads CSVs in the formats above can be loaded the same way.
- Permanent: replace the files in `data/` and run `python3 build.py`.

## How numbers are calculated

- Main measure is `distinct_orders`; cancelled orders are excluded unless the Cancelled status is switched on.
- Previous period = same number of days just before the range. Last year = the range shifted back 364 days so weekdays match.
- Month table MoM/YoY compares orders per day, so short months and the current partial month compare fairly.
- Daily ad spend by service = each campaign's monthly spend spread over the month in proportion to the account's daily spend.
- Holiday effects compare each holiday with the same weekdays in the four weeks before and after, skipping other holidays.
