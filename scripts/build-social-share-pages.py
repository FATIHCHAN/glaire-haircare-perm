"""Build the two public logo-card entries from the existing site pages."""
from pathlib import Path
from html import escape
import re
import json
from html_helpers import sync_webpage_graph

root = Path(__file__).resolve().parents[1]
logo = "https://glaire.ru/assets/images/icon-glaire-e9ed38d8e4-512.png"
site = json.loads((root / "content/site.json").read_text())

for slug, source in [("glaire", "index.html"), ("halloween", "halloween-bonus/index.html")]:
    page = (root / source).read_text()
    url = f"https://glaire.ru/{slug}/"
    def meta(key, value):
        global page
        attribute = "property" if key.startswith("og:") else "name"
        pattern = r'<meta\b(?=[^>]*(?:name|property)="' + re.escape(key) + r'")[^>]*>'
        page, count = re.subn(pattern, lambda m: f'<meta {attribute}="{key}" content="{escape(value, quote=True)}">', page, count=1)
        assert count == 1, key
    meta("robots", "noindex,follow,max-image-preview:large")
    meta("og:url", url)
    meta("og:image", logo)
    meta("og:image:secure_url", logo)
    meta("og:image:type", "image/png")
    meta("og:image:width", "512")
    meta("og:image:height", "512")
    meta("og:image:alt", "Логотип студии GLAIRE")
    meta("twitter:card", "summary")
    meta("twitter:image", logo)
    meta("twitter:image:alt", "Логотип студии GLAIRE")
    page, count = re.subn(r'<link\b(?=[^>]*rel="canonical")[^>]*>', f'<link rel="canonical" href="{url}">', page, count=1)
    assert count == 1, "canonical"
    page, count = re.subn(r'<link\b(?=[^>]*rel="alternate")(?=[^>]*hreflang="ru-RU")[^>]*>', f'<link rel="alternate" hreflang="ru-RU" href="{url}">', page, count=1)
    assert count == 1, "hreflang"
    page, count = re.subn(r'<link\b(?=[^>]*rel="image_src")[^>]*>', f'<link rel="image_src" href="{logo}">', page, count=1)
    assert count == 1, "image_src"
    if slug == "glaire":
        page = re.sub(r"<title>.*?</title>", f'<title>{escape(site["socialTitle"])}</title>', page, count=1)
    page = sync_webpage_graph(page)
    target = root / slug / "index.html"
    target.parent.mkdir(exist_ok=True)
    target.write_text(page)
    print(target)
