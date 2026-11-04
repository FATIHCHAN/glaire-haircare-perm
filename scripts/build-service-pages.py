"""Собирает пять направлений из главной, не меняя её.

Макет, фотографии, карта и механики общие; меняются тексты и метаданные.
Редактируемый источник: content/services.json. Общий сценарий: assets/site.js.
"""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SERVICES = json.loads((ROOT / "content/services.json").read_text())
HOME = ROOT / "index.html"
TEMPLATE = HOME.read_text()
HOME_HASH = hashlib.sha256(HOME.read_bytes()).hexdigest()


class TextBindings(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, source, values):
        super().__init__(convert_charrefs=False)
        self.values = values
        self.lines = [0] + [m.end() for m in re.finditer("\n", source)]
        self.stack = []
        self.edits = []

    def position(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            return
        attrs = dict(attrs)
        replacement = None
        if attrs.get("data-edit") in self.values:
            replacement = escape(self.values[attrs["data-edit"]])
        if attrs.get("id") == "visitList":
            replacement = "\n".join(
                f'<div class="future-item">{escape(item)}</div>'
                for item in self.values["visitItems"].splitlines())
        self.stack.append((tag, self.position() + len(self.get_starttag_text()), replacement))

    def handle_endtag(self, tag):
        match = next((i for i in range(len(self.stack) - 1, -1, -1)
                      if self.stack[i][0] == tag), None)
        if match is None:
            return
        _, start, replacement = self.stack[match]
        del self.stack[match:]
        if replacement is not None:
            self.edits.append((start, self.position(), replacement))


def metadata(page, key, value):
    attribute = "property" if key.startswith("og:") else "name"
    pattern = r'<meta\b(?=[^>]*(?:name|property)="' + re.escape(key) + r'")[^>]*>'
    page, count = re.subn(pattern,
                         f'<meta {attribute}="{key}" content="{escape(value, quote=True)}">',
                         page, count=1)
    assert count == 1, key
    return page


for service in SERVICES:
    page = TEMPLATE
    page = page.replace("<!doctype html>", '<!doctype html>\n<!-- Автоматическая страница: ' + service["label"] + '. Источник текстов: content/services.json. -->', 1)
    url = "https://glaire.ru/" + service["slug"] + "/"
    # Общий JS один для всех страниц. В JSON передаём только её текстовые поля.
    data = json.dumps({"slug": service["slug"], "text": service["text"]}, ensure_ascii=False, indent=2)
    data = data.replace("<", "\\u003c")
    page, count = re.subn(
        r'(<script\b[^>]*id="glairePageConfig"[^>]*>).*?(</script>)',
        lambda m: m[1] + data + m[2], page, count=1, flags=re.S)
    assert count == 1, "page config"

    # Initial HTML and the existing JS bindings display exactly the same copy.
    parser = TextBindings(page, service["text"])
    parser.feed(page)
    for start, end, value in sorted(parser.edits, reverse=True):
        page = page[:start] + value + page[end:]
    page = re.sub(r"<title>.*?</title>", f'<title>{escape(service["title"])}</title>', page, count=1)
    for key, value in {
        "description": service["description"],
        "keywords": ", ".join(["GLAIRE", *service["keywords"], "Пионерская 15"]),
        "og:title": service["title"], "twitter:title": service["title"],
        "og:description": service["description"], "twitter:description": service["description"],
        "og:url": url,
    }.items():
        page = metadata(page, key, value)
    page, count = re.subn(r'<link\b(?=[^>]*rel="canonical")[^>]*>',
                         f'<link rel="canonical" href="{url}">', page, count=1)
    assert count == 1
    page = re.sub(r'<link\b(?=[^>]*rel="alternate")(?=[^>]*hreflang="ru-RU")[^>]*>',
                  f'<link rel="alternate" hreflang="ru-RU" href="{url}">', page, count=1)

    # Retain the same studio/business/person identities, with a distinct WebPage.
    pattern = r'(<script\b[^>]*type="application/ld\+json"[^>]*>)(.*?)(</script>)'
    match = re.search(pattern, page, re.S)
    graph = json.loads(match[2])
    node = next(n for n in graph["@graph"] if n.get("@type") == "WebPage")
    node.update({"@id": url + "#webpage", "url": url, "name": service["title"],
                 "description": service["description"], "keywords": service["keywords"],
                 "mainEntity": {"@id": url + "#service"}})
    graph["@graph"].append({
        "@type": "Service", "@id": url + "#service", "url": url,
        "name": service["label"], "serviceType": service["label"],
        "description": service["description"],
        "provider": {"@id": "https://glaire.ru/#business"},
        "areaServed": {"@type": "City", "name": "Пермь"},
    })
    page = page[:match.start(2)] + json.dumps(graph, ensure_ascii=False, indent=2) + page[match.end(2):]
    # Root-relative assets avoid a <base> that would send section links home.
    page = re.sub(r'(?<![\w/])assets/', '/assets/', page)
    for asset in ("favicon.ico", "browserconfig.xml", "site.webmanifest"):
        page = page.replace(f'="{asset}"', f'="/{asset}"')
    page = page.replace('"admin-panel.js?', '"/admin-panel.js?')
    links = ['<a href="/">Главная</a>']
    for other in SERVICES:
        current = ' aria-current="page"' if other["slug"] == service["slug"] else ""
        links.append(f'<a href="/{other["slug"]}/"{current}>{escape(other["label"])}</a>')
    nav = '<nav class="service-links" aria-label="Направления GLAIRE">\n' + "\n".join(links) + '\n</nav>'
    page, count = re.subn(r'<nav class="service-links".*?</nav>', nav, page, count=1, flags=re.S)
    assert count == 1
    footer_nav = nav.replace('class="service-links"', 'class="footer-pages"').replace(
        'aria-label="Направления GLAIRE"', 'aria-label="Страницы GLAIRE"')
    page, count = re.subn(r'<nav class="footer-pages".*?</nav>', footer_nav, page, count=1, flags=re.S)
    assert count == 1
    target = ROOT / service["slug"] / "index.html"
    target.parent.mkdir(exist_ok=True)
    target.write_text(page)
    print(target.relative_to(ROOT))

assert hashlib.sha256(HOME.read_bytes()).hexdigest() == HOME_HASH, "Homepage changed"
print("Homepage untouched: " + HOME_HASH)
