#!/usr/bin/env bash
# Assemble the publishable shop into dist/.
#
# Public by default: index.html, config.js, js/catalog.js, data/, assets/.
# Left out: private/ (commission and partner-store contacts — never public),
# supplies.html (internal buying list), admin.html, apps-script/ (it holds the
# admin code), the docs and these scripts.
#
#   ./build-dist.sh               production headers
#   ./build-dist.sh --staging     adds X-Robots-Tag: noindex, so a test URL can't get indexed
#   ./build-dist.sh --with-admin  also publishes admin.html. Only worth it once the Google
#                                 Sheet is connected — then every save is checked against the
#                                 code by Google, commission comes from the Sheet, and the page
#                                 itself holds nothing secret (private/ still stays out).
#                                 Without the Sheet, admin edits only ever reach the browser
#                                 they're made in, so hosting it gains you nothing.
set -euo pipefail
cd "$(dirname "$0")"

staging=0; admin=0
for a in "$@"; do
  case "$a" in
    --staging) staging=1 ;;
    --with-admin) admin=1 ;;
    *) echo "unknown option: $a" >&2; exit 1 ;;
  esac
done

rm -rf dist && mkdir -p dist/js
cp index.html config.js _headers manifest.webmanifest sw.js dist/
cp js/catalog.js js/version.js dist/js/
cp -r assets data dist/

if [ "$admin" = 1 ]; then
  cp admin.html dist/
  cp js/admin-lib.js dist/js/
  echo "admin: included (admin.html)"
fi

if [ "$staging" = 1 ]; then
  # uncomment the noindex rule that ships commented-out in _headers
  sed -i.bak 's|^  # X-Robots-Tag: noindex, nofollow|  X-Robots-Tag: noindex, nofollow|' dist/_headers
  rm -f dist/_headers.bak
  echo "staging: noindex enabled"
fi

# belt and braces: nothing private may ride along
if grep -rqs '"commission"' dist/data dist/index.html; then echo "refusing: commission found in dist/" >&2; exit 1; fi
[ -e dist/private ] && { echo "refusing: dist/private exists" >&2; exit 1; }

version=$(sed -n "s/.*SALEEM_VERSION = '\([^']*\)'.*/\1/p" js/version.js)
echo "dist/ ready — $version, $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
