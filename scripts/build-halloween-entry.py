"""Regenerate the share entry from index.html without duplicating editable content."""
from pathlib import Path
from html import escape
import re

root = Path(__file__).resolve().parents[1]
from runpy import run_path
run_path(str(root / "scripts/sync-static-content.py"))
page = (root / "index.html").read_text()
page = page.replace("<head>", '<head>\n    <base href="/">', 1)
page = re.sub(r"<title>.*?</title>", "<title>GLAIRE Halloween бонус</title>", page, count=1)

def meta(key, value):
    global page
    pattern = r'<meta\b(?=[^>]*(?:name|property)="' + re.escape(key) + r'")[^>]*>'
    attribute = "property" if key.startswith("og:") else "name"
    page, count = re.subn(pattern, f'<meta {attribute}="{key}" content="{escape(value, quote=True)}">', page, count=1)
    assert count == 1, key

meta("description", "Колесо Хэллоуина в GLAIRE: откройте праздничный бонус к визиту. Пермь, ул. Пионерская, 15.")
meta("robots", "noindex,follow,max-image-preview:large")
for key in ["og:title", "twitter:title"]:
    meta(key, "GLAIRE Halloween бонус")
for key in ["og:description", "twitter:description"]:
    meta(key, "Поверните колесо и откройте подарок к вашему визиту. Бонусы доступны до 30 ноября.")
meta("og:url", "https://glaire.ru/halloween-bonus/")
page, count = re.subn(r'<link\b(?=[^>]*rel="canonical")[^>]*>', '<link rel="canonical" href="https://glaire.ru/halloween-bonus/">', page, count=1)
assert count == 1, "canonical"
page, count = re.subn(r'<link\b(?=[^>]*rel="alternate")(?=[^>]*hreflang="ru-RU")[^>]*>', '<link rel="alternate" hreflang="ru-RU" href="https://glaire.ru/halloween-bonus/">', page, count=1)
assert count == 1, "hreflang"
for key in ["og:image", "twitter:image"]:
    meta(key, "https://glaire.ru/assets/social/glaire-halloween-20261102.jpg")
meta("og:image:secure_url", "https://glaire.ru/assets/social/glaire-halloween-20261102.jpg")
meta("og:image:type", "image/jpeg")
meta("og:image:width", "1200")
meta("og:image:height", "630")
meta("og:image:alt", "GLAIRE Halloween бонус — подарок к вашему визиту")
meta("twitter:image:alt", "GLAIRE Halloween бонус — подарок к вашему визиту")
page, count = re.subn(r'<link\b(?=[^>]*rel="image_src")[^>]*>', '<link rel="image_src" href="https://glaire.ru/assets/social/glaire-halloween-20261102.jpg">', page, count=1)
assert count == 1, "image_src"
for slug in ["halloween-bonus", "halloween-surprise"]:
    target = root / slug / "index.html"
    target.parent.mkdir(exist_ok=True)
    target.write_text(page)
    print(target)

# Keep the public logo-card entries in sync with the ordinary pages.
run_path(str(root / "scripts/build-social-share-pages.py"))
