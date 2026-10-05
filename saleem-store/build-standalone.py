#!/usr/bin/env python3
"""Bundle each page into one self-contained HTML file.

The normal build is index.html + data/ + assets/, which is what you deploy. This
makes single files you can email, drop in Slack, or open straight off disk —
handy for sharing a preview before the shop is hosted anywhere.

    python3 build-standalone.py

writes Saleem_Store_standalone.html (the shop) and
Saleem_Supplies_standalone.html (the internal buying list).

Deploy index.html, not these. The inlined images are base64, so they cost about
a third more bytes and can't be cached separately by the browser.
"""
import base64, mimetypes, pathlib, re

HERE = pathlib.Path(__file__).parent
PAGES = {"index.html": "Saleem_Store_standalone.html",
         "supplies.html": "Saleem_Supplies_standalone.html"}

def bundle(src, out):
    html = (HERE / src).read_text(encoding="utf-8")
    seen = {}

    def inline_img(m):
        attr, path = m.group(1), m.group(2)
        f = HERE / path
        if not f.exists():
            print(f"  ! missing, left as-is: {path}")
            return m.group(0)
        if path not in seen:
            mime = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
            seen[path] = f"data:{mime};base64,{base64.b64encode(f.read_bytes()).decode()}"
            print(f"  + {path} ({f.stat().st_size:,} bytes)")
        return f'{attr}="{seen[path]}"'

    def inline_js(m):
        f = HERE / m.group(1)
        print(f"  + {m.group(1)} ({f.stat().st_size:,} bytes)")
        # a literal </script> inside the data would end the tag early
        return "<script>\n" + f.read_text(encoding="utf-8").replace("</script", "<\\/script") + "\n</script>"

    html = re.sub(r'<script src="((?!https?:|//)[^"]+\.js)"></script>', inline_js, html)
    html = re.sub(r'\b(src|href)="((?!data:|https?:|//|#)[^"]+\.(?:png|jpe?g|webp|gif|svg))"', inline_img, html)
    (HERE / out).write_text(html, encoding="utf-8")
    print(f"{out}: {(HERE / out).stat().st_size:,} bytes\n")

for src, out in PAGES.items():
    print(src)
    bundle(src, out)
