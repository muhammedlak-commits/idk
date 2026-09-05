#!/usr/bin/env python3
"""Inline every asset into one self-contained HTML file.

The normal build is index.html + assets/, which is what you deploy. This makes a
single file you can email, drop in Slack, or open straight off disk with no server
— handy for sharing a preview before the funnel is hosted anywhere.

    python3 build-standalone.py [output.html]

Deploy index.html, not this. The inlined images are base64, so they cost about a
third more bytes and can't be cached separately by the browser.
"""
import base64, mimetypes, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
SRC  = HERE / "index.html"
OUT  = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "Saleem_Ozempic_Funnel_standalone.html"

html = SRC.read_text(encoding="utf-8")
seen = {}

def inline(match):
    attr, path = match.group(1), match.group(2)
    if path.startswith(("data:", "http:", "https:", "//")):
        return match.group(0)
    f = HERE / path
    if not f.exists():
        print(f"  ! missing, left as-is: {path}")
        return match.group(0)
    if path not in seen:
        mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        seen[path] = f"data:{mime};base64,{base64.b64encode(f.read_bytes()).decode()}"
        print(f"  + {path} ({f.stat().st_size:,} bytes)")
    return f'{attr}="{seen[path]}"'

# a preload hint would inline the same image a second time for no benefit here
html = re.sub(r'\s*<link rel="preload" as="image" href="[^"]+">', '', html)

html = re.sub(r'\b(src|href)="((?!data:|https?:|//|#)[^"]+\.(?:png|jpe?g|webp|gif|svg|mp4|woff2?))"', inline, html)

OUT.write_text(html, encoding="utf-8")
print(f"\n{OUT.name}: {OUT.stat().st_size:,} bytes, {len(seen)} asset(s) inlined")
