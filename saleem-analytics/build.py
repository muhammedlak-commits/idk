"""Build the self-contained dashboard: embeds data/*.csv into src/template.html."""
import json, datetime, pathlib
root = pathlib.Path(__file__).parent
d = root / 'data'
payload = {
    'services': (d / 'services_daily.csv').read_text(),
    'adsDaily': (d / 'meta_ads_daily.csv').read_text(),
    'adsMonthly': (d / 'meta_ads_campaign_monthly.csv').read_text(),
    'map': (d / 'campaign_service_map.csv').read_text(),
    'events': (d / 'events.csv').read_text(),
    'built': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
}
blob = json.dumps(payload, separators=(',', ':')).replace('</', '<\\/')
html = (root / 'src' / 'template.html').read_text().replace('/*DATA*/', blob)
out = root / 'dist' / 'saleem-performance.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, f'{len(html)/1024:.0f} KB')
