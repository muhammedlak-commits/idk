"""Match every Meta ad to the service it promotes.

Reads data/meta_ads_ad_monthly.csv and writes data/ad_service_map.csv
(ad_id, ad_name, adset_name, campaign_name, ad_group, matched_by). Edit the ad_group column
of that file by hand to correct a match; rows you edit are kept on the next run
(matched_by = "manual").

Order, first match wins:
  1. campaign-level groups that don't depend on the creative (recruitment, app installs, awareness)
  2. the ad's code prefix (PT105, NS010, DRV136, LT02, ...)
  3. keywords in the ad name (English and Arabic)
  4. keywords in the ad set name
  5. keywords in the campaign name
  6. otherwise "All services (general)"
"""
import csv, re, pathlib

root = pathlib.Path(__file__).parent
data = root / 'data'

CODE_PREFIX = [  # ad names that start with a creative code
    (r'^\W*PT\s?\d', 'Physiotherapy'),
    (r'^\W*NS\s?\d', 'Nursing'),
    (r'^\W*(DRV?|DocVis)\s?\d', 'Doctor visit'),
    (r'^\W*LT\s?\d', 'Lab tests'),
    (r'^\W*(Phys|Phyiso)\s?\d', 'Physiotherapy'),
    (r'^\W*Nur\s?\d', 'Nursing'),
    (r'^\W*Psych\s?\d', 'Telemedicine'),
    (r'^\W*(Eco|ECG)\s?\d', 'Imaging'),
    (r'^\W*App\s?\d', 'App'),
]
KEYWORDS = [  # checked in this order, so specific services come before broad words
    ('Recruitment', r'hiring|recruit|\bstaff\b|توظيف'),
    ('B2B', r'\bb2b\b|expert-i|corporate|شركات'),
    ('Products', r'\bbags?\b|brace|rozenama|حقيبة|منتج'),
    ('International referral', r'\bipr\b|jordan|india|turkey|العلاج (في|بال)خارج'),
    ('Wound care', r'wound|جروح|تقرح|قرح الفراش'),
    ('Eye exam', r'eye exam|\beyes?\b|عيون|نظر'),
    ('Imaging', r'imaging|x-?ray|ultra ?sound|doppler|\becho\b|\beco\b|\becg\b|radiolog|sonar|أشعة|اشعة|سونار|ايكو|تخطيط'),
    ('Lab tests', r'lab ?test|\blab\b|\blt\b|تحاليل|تحليل|فحوصات'),
    ('Telemedicine', r'psych|therapy session|arab therapy|second opinion|نفسي|استشارة'),
    ('Surgery', r'surger'),
    ('Physiotherapy', r'physio|phyiso|\bpt\b|rehab|علاج طبيعي|المعالج الفيزيائي|فيزيائي|تأهيل'),
    ('Nursing', r'nurs|\bns\b|تمريض|ممرض|رعاية'),
    ('Doctor visit', r'dr\.? ?visit|drvisit|docvis|doctor|\bdrv?\b|زيارة طبية|طبيب|دكتور'),
    ('App', r'\bapp\b|install|تطبيق'),
    ('Brand & awareness', r'awareness|profile traffic|followers|engagement campaign|tvc|\bugc\b'),
]
GENERAL = 'All services (general)'


def keyword_group(text):
    for group, pat in KEYWORDS:
        if re.search(pat, text or '', re.I):
            return group
    return None


def match(ad, adset, campaign, objective):
    c = campaign or ''
    # 1. campaign-level groups: what the campaign buys matters more than the creative
    if re.search(r'hiring|recruit|\bstaff\b', c, re.I) or re.search(r'hiring|recruit', ad or '', re.I):
        return 'Recruitment', 'campaign'
    if objective == 'OUTCOME_APP_PROMOTION' or re.search(r'app (installs?|awareness|traffic|engagment|engagement|purchase)|installs \||app reg', c, re.I):
        return 'App', 'campaign'
    if objective == 'OUTCOME_AWARENESS' or re.search(r'awareness|profile traffic', c, re.I):
        return 'Brand & awareness', 'campaign'
    # 2. creative code
    for pat, group in CODE_PREFIX:
        if re.search(pat, ad or '', re.I):
            return group, 'ad code'
    # 3-5. keywords, from the most specific name to the least
    for text, how in ((ad, 'ad name'), (adset, 'ad set name'), (campaign, 'campaign name')):
        g = keyword_group(text)
        if g and not (g == 'Brand & awareness' and how == 'ad name'):
            return g, how
    return GENERAL, 'none'


def main():
    objectives = {}
    for r in csv.DictReader(open(data / 'meta_ads_campaign_monthly.csv', encoding='utf-8')):
        objectives[r['campaign_id']] = r['objective']
    manual = {}
    out_path = data / 'ad_service_map.csv'
    if out_path.exists():
        for r in csv.DictReader(open(out_path, encoding='utf-8')):
            if r.get('matched_by') == 'manual':
                manual[r['ad_id']] = r['ad_group']
    ads = {}
    for r in csv.DictReader(open(data / 'meta_ads_ad_monthly.csv', encoding='utf-8')):
        a = ads.setdefault(r['ad_id'], {'ad_name': r['ad_name'], 'adset_name': r['adset_name'],
                                         'campaign_id': r['campaign_id'], 'campaign_name': r['campaign_name'], 'spend': 0.0})
        a['spend'] += float(r['spend_usd'] or 0)
    rows, by_how, by_group = [], {}, {}
    for ad_id, a in ads.items():
        if ad_id in manual:
            g, how = manual[ad_id], 'manual'
        else:
            g, how = match(a['ad_name'], a['adset_name'], a['campaign_name'], objectives.get(a['campaign_id'], ''))
        rows.append([ad_id, a['ad_name'], a['adset_name'], a['campaign_name'], g, how])
        by_how[how] = by_how.get(how, 0) + a['spend']
        by_group[g] = by_group.get(g, 0) + a['spend']
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['ad_id', 'ad_name', 'adset_name', 'campaign_name', 'ad_group', 'matched_by'])
        w.writerows(sorted(rows, key=lambda r: (r[4], r[3], r[1])))
    total = sum(by_group.values())
    print(f'{len(rows)} ads, ${total:,.0f}')
    for k, v in sorted(by_how.items(), key=lambda x: -x[1]):
        print(f'  matched by {k:14s} ${v:>10,.0f}  {v / total:5.1%}')
    for k, v in sorted(by_group.items(), key=lambda x: -x[1]):
        print(f'  {k:26s} ${v:>10,.0f}')


if __name__ == '__main__':
    main()
