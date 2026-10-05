#!/usr/bin/env python3
"""Bundle each page into one self-contained HTML file.

The normal build is index.html + data/ + assets/, which is what you deploy. This
makes single files you can email, drop in Slack, or open straight off disk —
handy for sharing a preview before the shop is hosted anywhere.

    python3 build-standalone.py

writes Saleem_Store_standalone.html (the shop), Saleem_Supplies_standalone.html
(the internal buying list) and Saleem_Admin_standalone.html (the admin portal).
Keep the admin and store files in the same folder: the admin's "Preview in the
shop" opens the store file next to it.

Saleem_Admin_standalone.html carries private/commercial.js inside it — commission
and partner-store contacts. Share it with staff only, never with a store or customer.
The store file never includes it.

Deploy index.html, not these. The inlined images are base64, so they cost about
a third more bytes and can't be cached separately by the browser.
"""
import base64, mimetypes, pathlib, re

HERE = pathlib.Path(__file__).parent
PAGES = {"index.html": "Saleem_Store_standalone.html",
         "supplies.html": "Saleem_Supplies_standalone.html",
         "admin.html": "Saleem_Admin_standalone.html"}
# links between the pages, pointed at their standalone names
LINKS = {"admin.html": [("shopUrl    : 'index.html'", "shopUrl    : 'Saleem_Store_standalone.html'")]}

def bundle(src, out):
    html = (HERE / src).read_text(encoding="utf-8")
    for a, b in LINKS.get(src, []):
        assert a in html, f"{src}: expected to find {a!r}"
        html = html.replace(a, b)
    seen = {}

    def data_uri(path):
        f = HERE / path
        if not f.exists():
            print(f"  ! missing, left as-is: {path}")
            return path
        if path not in seen:
            mime = mimetypes.guess_type(f.name)[0] or ("image/webp" if f.suffix == ".webp" else "application/octet-stream")
            seen[path] = f"data:{mime};base64,{base64.b64encode(f.read_bytes()).decode()}"
            print(f"  + {path} ({f.stat().st_size:,} bytes)")
        return seen[path]

    def inline_img(m):
        uri = data_uri(m.group(2))
        return m.group(0) if uri == m.group(2) else f'{m.group(1)}="{uri}"'

    def inline_js(m):
        f = HERE / m.group(1)
        print(f"  + {m.group(1)} ({f.stat().st_size:,} bytes)")
        js = f.read_text(encoding="utf-8")
        # product photos published from the admin live in assets/products/ — carry them along
        js = re.sub(r'"img":"(assets/[^"]+)"', lambda g: '"img":"' + data_uri(g.group(1)) + '"', js)
        # a literal </script> inside the data would end the tag early
        return "<script>\n" + js.replace("</script", "<\\/script") + "\n</script>"

    html = re.sub(r'<script src="((?!https?:|//)[^"]+\.js)"></script>', inline_js, html)
    html = re.sub(r'\b(src|href)="((?!data:|https?:|//|#)[^"]+\.(?:png|jpe?g|webp|gif|svg))"', inline_img, html)
    (HERE / out).write_text(html, encoding="utf-8")
    print(f"{out}: {(HERE / out).stat().st_size:,} bytes\n")

for src, out in PAGES.items():
    print(src)
    bundle(src, out)
