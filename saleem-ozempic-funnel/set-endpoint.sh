#!/usr/bin/env bash
# Point the landing page at your Apps Script, then rebuild both bundles.
#
#   ./set-endpoint.sh https://script.google.com/macros/s/AKfy.../exec
#
# Run this instead of hand-editing index.html — it patches the file, rebuilds
# dist/ and the single-file build, and tells you what to drop on Netlify.
set -euo pipefail
cd "$(dirname "$0")"

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "usage: ./set-endpoint.sh <apps-script /exec url>" >&2
  echo "current: $(grep -m1 '^  endpoint' index.html | sed 's/.*"\(.*\)".*/\1/' | sed 's/^$/(empty — demo mode)/')" >&2
  exit 1
fi
case "$URL" in
  https://*) ;;
  *) echo "refusing: endpoint must be https:// — leads carry patient data" >&2; exit 1;;
esac
case "$URL" in
  */exec) ;;
  *) echo "warning: Apps Script web-app URLs normally end in /exec — got: $URL" >&2;;
esac

python3 - "$URL" <<'PY'
import re, sys, pathlib
url = sys.argv[1]
p = pathlib.Path('index.html'); s = p.read_text()
new, n = re.subn(r'(\n  endpoint   : ")[^"]*(",)', lambda m: m.group(1) + url + m.group(2), s, count=1)
if n != 1:
    sys.exit("could not find CONFIG.endpoint in index.html")
p.write_text(new)
print(f"endpoint set: {url}")
PY

./build-dist.sh --staging
python3 build-standalone.py dist-single/index.html >/dev/null 2>&1 || {
  mkdir -p dist-single && python3 build-standalone.py dist-single/index.html >/dev/null; }
cp _headers dist-single/_headers
sed -i.bak 's|^  # X-Robots-Tag: noindex, nofollow|  X-Robots-Tag: noindex, nofollow|' dist-single/_headers
rm -f dist-single/_headers.bak

echo
echo "ready to deploy — drop either folder on Netlify:"
echo "  dist/         index.html + assets/   ($(du -sh dist | cut -f1))"
echo "  dist-single/  one self-contained file ($(du -sh dist-single | cut -f1))"
