#!/usr/bin/env bash
# Assemble the publishable shop into dist/.
#
# Only the shop is public: index.html, data/products.js and assets/. The buying
# list (supplies.html) is an internal procurement reference and stays out, as
# do the docs and these scripts.
#
#   ./build-dist.sh            production headers
#   ./build-dist.sh --staging  adds X-Robots-Tag: noindex, so a test URL can't
#                              get indexed
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist && mkdir -p dist
cp index.html _headers dist/
cp -r assets data dist/

if [ "${1:-}" = "--staging" ]; then
  # uncomment the noindex rule that ships commented-out in _headers
  sed -i.bak 's|^  # X-Robots-Tag: noindex, nofollow|  X-Robots-Tag: noindex, nofollow|' dist/_headers
  rm -f dist/_headers.bak
  echo "staging: noindex enabled"
fi

echo "dist/ ready — $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
