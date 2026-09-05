#!/usr/bin/env bash
# Assemble the publishable site into dist/.
#
# Only the landing page and its assets are public. Everything else in this repo
# — the Apps Script (staff allowlist, access key), the docs, this script — must
# never reach a web host.
#
#   ./build-dist.sh            production headers
#   ./build-dist.sh --staging  adds X-Robots-Tag: noindex, so a test URL can't
#                              get indexed while it carries medical claims
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist && mkdir -p dist
cp index.html dist/
cp -r assets dist/
cp _headers dist/

if [ "${1:-}" = "--staging" ]; then
  # uncomment the noindex rule that ships commented-out in _headers
  sed -i.bak 's|^  # X-Robots-Tag: noindex, nofollow|  X-Robots-Tag: noindex, nofollow|' dist/_headers
  rm -f dist/_headers.bak
  echo "staging: noindex enabled"
fi

echo "dist/ ready — $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
