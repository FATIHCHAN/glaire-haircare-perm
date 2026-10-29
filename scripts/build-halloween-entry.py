"""Regenerate the share entry from index.html without duplicating editable content."""
from pathlib import Path
from html import escape
import re

root = Path(__file__).resolve().parents[1]
page = (root / "index.html").read_text()
page = page.replace("<head>", '<head>\n    <base href="/">', 1)
page = re.sub(r"<title>.*?</title>", "<title>GLAIRE — Хэллоуинский сюрприз</title>", page, count=1)

def meta(key, value):
    global page
    pattern = r'<meta\b(?=[^>]*(?:name|property)="' + re.escape(key) + r'")[^>]*>'
    attribute = "property" if key.startswith("og:") else "name"
    page, count = re.subn(pattern, f'<meta {attribute}="{key}" content="{escape(value, quote=True)}">', page, count=1)
    assert count == 1, key

meta("description", "Колесо Хэллоуина в GLAIRE: откройте праздничный бонус к визиту. Пермь, ул. Пионерская, 15.")
meta("robots", "noindex,follow,max-image-preview:large")
for key in ["og:title", "twitter:title"]:
    meta(key, "GLAIRE — Хэллоуинский сюрприз")
for key in ["og:description", "twitter:description"]:
    meta(key, "Поверните колесо и откройте подарок к вашему визиту. Бонусы доступны до 30 ноября.")
meta("og:url", "https://glaire.ru/halloween-surprise/")
for key in ["og:image", "twitter:image"]:
    meta(key, "https://glaire.ru/assets/events/halloween/share-cover-v1.png")
meta("og:image:width", "1200")
meta("og:image:height", "630")
meta("og:image:alt", "GLAIRE — Хэллоуинский сюрприз: колесо праздничных бонусов")
target = root / "halloween-surprise/index.html"
target.parent.mkdir(exist_ok=True)
target.write_text(page)
print(target)
