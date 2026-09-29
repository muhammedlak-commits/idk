"""Build the self-contained dashboard.

Source is split into modules under src/: page shell (head.html, layout.html), styles.css and
one JS file per module in src/js/. They share one scope, in the order below, and the data in
data/*.csv is embedded as JSON so the page works as a single file.
"""
import json, datetime, pathlib
root = pathlib.Path(__file__).parent
src, d = root / 'src', root / 'data'

JS_ORDER = [
    'core.js',        # storage, dates, formatting, service labels
    'data.js',        # parsing: services cube, ads model, Hijri holidays, events
    'state.js',       # shared filter state and series helpers
    'filters.js',     # filter bar
    'charts.js',      # bucketing and Chart.js plumbing
    'm_overview.js',  # module: KPIs + trend + ad spend
    'm_monthly.js',   # module: month-by-month MoM / YoY
    'm_services.js',  # module: service breakdown
    'm_weekday.js',   # module: by weekday (Performance)
    'm_providers.js', # module: providers and doctor specialties (+ drivers panel in links)
    'm_gateway.js',   # providers module: gateway providers and retention
    'm_provlinks.js', # service links: provider follow-on and busy weeks
    'm_links.js',     # module: service links
    'm_linkcmp.js',   # service links: compare two periods, by provider and specialty
    'm_patients.js',  # module: unique patients
    'm_ads.js',       # module: Meta ads
    'm_calendar.js',  # module: holiday effects + events log
    'seasonal.js',    # last year by Hijri date or weekday, and the usual move
    'm_why.js',       # module: what changed and why (uses calendar, ads, providers)
    'm_sections.js',  # Summary tiles and attention list, Performance month strip, Drivers cards
    'm_projections.js',  # module: projections
    'm_sheet.js',     # live outside-factors Google Sheet
    'm_cloud.js',     # saved uploads: CSV assets + db pointers on claude.ai
    'm_data.js',      # module: drag-and-drop data loading
    'files.js',       # Load CSV (header button)
    'main.js',        # tabs, render, boot
]

payload = {
    'services': (d / 'services_daily.csv').read_text(),
    'servicesBooked': (d / 'services_daily_booked.csv').read_text() if (d / 'services_daily_booked.csv').exists() else '',
    'sqlScheduled': (root / 'sql' / 'orders_daily_by_scheduled_time.sql').read_text(),
    'sqlBooked': (root / 'sql' / 'orders_daily_by_booking_time.sql').read_text(),
    'adsDaily': (d / 'meta_ads_daily.csv').read_text(),
    'adsMonthly': (d / 'meta_ads_campaign_monthly.csv').read_text(),
    'map': (d / 'campaign_service_map.csv').read_text(),
    'adsAd': (d / 'meta_ads_ad_monthly.csv').read_text() if (d / 'meta_ads_ad_monthly.csv').exists() else '',
    'adMap': (d / 'ad_service_map.csv').read_text() if (d / 'ad_service_map.csv').exists() else '',
    'events': (d / 'events.csv').read_text(),
    'uniquePatients': (d / 'unique_patients_monthly.csv').read_text() if (d / 'unique_patients_monthly.csv').exists() else '',
    'uniqueSql': (root / 'sql' / 'unique_patients_monthly.sql').read_text(),
    'followon': (d / 'service_followon_monthly.csv').read_text() if (d / 'service_followon_monthly.csv').exists() else '',
    'followonSql': (root / 'sql' / 'service_followon_monthly.sql').read_text(),
    'providers': (d / 'provider_orders_daily.csv').read_text() if (d / 'provider_orders_daily.csv').exists() else '',
    'providersSql': (root / 'sql' / 'provider_orders_daily.sql').read_text(),
    'gateway': (d / 'gateway_provider_monthly.csv').read_text() if (d / 'gateway_provider_monthly.csv').exists() else '',
    'gatewaySql': (root / 'sql' / 'gateway_provider_monthly.sql').read_text() if (root / 'sql' / 'gateway_provider_monthly.sql').exists() else '',
    'gatewayNext': (d / 'gateway_next_services_monthly.csv').read_text() if (d / 'gateway_next_services_monthly.csv').exists() else '',
    'gatewayNextSql': (root / 'sql' / 'gateway_next_services_monthly.sql').read_text(),
    'provFollowon': (d / 'provider_followon_monthly.csv').read_text() if (d / 'provider_followon_monthly.csv').exists() else '',
    'provFollowonSql': (root / 'sql' / 'provider_followon_monthly.sql').read_text() if (root / 'sql' / 'provider_followon_monthly.sql').exists() else '',
    'competitors': (d / 'competitors.csv').read_text() if (d / 'competitors.csv').exists() else '',
    'sheet': json.loads((d / 'sheet.json').read_text()) if (d / 'sheet.json').exists() else None,
    'built': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
}
blob = json.dumps(payload, separators=(',', ':')).replace('<', '\\u003c')
js = '\n'.join(f'/* ===== {name} ===== */\n' + (src / 'js' / name).read_text() for name in JS_ORDER)

html = (
    (src / 'head.html').read_text()
    + '<style>\n' + (src / 'styles.css').read_text() + '</style>\n\n'
    + (src / 'layout.html').read_text()
    + '\n<script id="payload" type="application/json">' + blob + '</script>\n'
    + "<script>\n(function(){\n'use strict';\nconst P = JSON.parse(document.getElementById('payload').textContent);\n\n"
    + js + '\n})();\n</script>\n'
)
out = root / 'dist' / 'saleem-performance.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, f'{len(html)/1024:.0f} KB')
