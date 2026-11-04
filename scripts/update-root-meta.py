"""Обновляет метаданные главной из content/site.json, не меняя её макет.

Title — имя вкладки и кандидат заголовка поиска; description — описание.
JSON-LD связывает сайт, студию, исполнителя и пять действующих направлений.
"""
from pathlib import Path
from html import escape
import json
import re

ROOT = Path(__file__).resolve().parents[1]
site = json.loads((ROOT / "content/site.json").read_text())
services = json.loads((ROOT / "content/services.json").read_text())
path = ROOT / "index.html"
page = path.read_text()
page = re.sub(r"<title>.*?</title>", f'<title>{escape(site["title"])}</title>', page, count=1)
values = {
    "description": site["description"], "keywords": ", ".join(site["keywords"]),
    "og:title": site["socialTitle"], "twitter:title": site["socialTitle"],
    "og:description": site["socialDescription"],
    "twitter:description": site["socialDescription"],
}
for key, value in values.items():
    attr = "property" if key.startswith("og:") else "name"
    pattern = r'<meta\b(?=[^>]*(?:name|property)="' + re.escape(key) + r'")[^>]*>'
    page, count = re.subn(pattern, f'<meta {attr}="{key}" content="{escape(value, quote=True)}">', page, count=1)
    assert count == 1, key

match = re.search(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S)
graph = json.loads(match[1])
for node in graph["@graph"]:
    if node.get("@type") == "WebPage":
        node.update(name=site["title"], description=site["description"], keywords=site["keywords"])
        node["primaryImageOfPage"]["url"] = "https://glaire.ru/assets/images/IMG_3907_h6ghr5.heic-1280-v1793126750.webp"
    if node.get("@id") == "https://glaire.ru/#business":
        node["description"] = site["description"]
        # keywords относится к WebPage, а не к типу HairSalon/BeautySalon.
        node.pop("keywords", None)
        node.pop("priceRange", None)
        node["hasOfferCatalog"]["itemListElement"] = [
            {"@type": "Offer", "itemOffered": {
                "@type": "Service", "name": service["label"],
                "serviceType": service["label"], "areaServed": "Пермь",
                "url": f'https://glaire.ru/{service["slug"]}/',
            }} for service in services
        ]

# Язык описан у сайта и WebPage. EntryPoint задаёт только способ онлайн-записи.
def clean_entry_points(value):
    if isinstance(value, dict):
        if value.get("@type") == "EntryPoint":
            value.pop("inLanguage", None)
        for child in value.values():
            clean_entry_points(child)
    elif isinstance(value, list):
        for child in value:
            clean_entry_points(child)

clean_entry_points(graph)
page = page[:match.start(1)] + json.dumps(graph, ensure_ascii=False, indent=2) + page[match.end(1):]
path.write_text(page)
print("Главная: title, description, социальные метаданные и каталог услуг обновлены")
