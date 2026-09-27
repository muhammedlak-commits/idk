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
    'm_patients.js',  # module: unique patients
    'm_ads.js',       # module: Meta ads
    'm_calendar.js',  # module: holiday effects + events log
    'm_projections.js',  # module: projections
    'files.js',       # Load CSV
    'main.js',        # tabs, render, boot
]

payload = {
    'services': (d / 'services_daily.csv').read_text(),
    'adsDaily': (d / 'meta_ads_daily.csv').read_text(),
    'adsMonthly': (d / 'meta_ads_campaign_monthly.csv').read_text(),
    'map': (d / 'campaign_service_map.csv').read_text(),
    'events': (d / 'events.csv').read_text(),
    'uniquePatients': (d / 'unique_patients_monthly.csv').read_text() if (d / 'unique_patients_monthly.csv').exists() else '',
    'uniqueSql': (root / 'sql' / 'unique_patients_monthly.sql').read_text(),
    'built': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
}
blob = json.dumps(payload, separators=(',', ':')).replace('</', '<\\/')
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
