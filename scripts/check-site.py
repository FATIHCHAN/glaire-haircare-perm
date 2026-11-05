"""Проверяет локальную сборку GLAIRE без публикации и внешних запросов.

Проверки защищают реальные требования: единый макет, исходный абзац главной,
пять отдельных направлений, карта без изменений, рабочие статические ссылки,
согласованные поисковые данные и воспроизводимая сборка.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_INTRO = "Работаем по состоянию волос и задаче, с которой вы приходите. Подбираем формат: стрижка, окрашивание, уход, реконструкция, модификация или комплекс — чтобы результат выглядел аккуратно и удобно носился каждый день."
MAP_URL = "https://yandex.com/map-widget/v1/?ll=56.248626%2C57.996496&mode=search&oid=208558029908&ol=biz&z=18"


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.tags = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def find(self, tag, **attributes):
        return [a for t, a in self.tags if t == tag and all(a.get(k) == v for k, v in attributes.items())]


def defaults():
    source = (ROOT / "assets/site.js").read_text()
    start = source.index("const STUDIO_PHOTOS =")
    end = source.index("const STUDIO_SOCIAL_LINKS =", start)
    code = "const vm=require('node:vm'),fs=require('node:fs');process.stdout.write(vm.runInNewContext(fs.readFileSync(0,'utf8')+';JSON.stringify(CONFIG_DEFAULT)',{}, {timeout:1000}));"
    return json.loads(subprocess.run([shutil.which("node"), "-e", code], input=source[start:end], capture_output=True, text=True, check=True).stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--rebuild", action="store_true", help="Также проверить повторяемость сборки")
    args = parser.parse_args()
    site = json.loads((ROOT / "content/site.json").read_text())
    services = json.loads((ROOT / "content/services.json").read_text())
    config = defaults()
    assert config["heroTitle"] == "GLAIRE — Пространство красоты в Перми"
    assert config["heroText"] == ORIGINAL_INTRO
    assert config["mapEmbedUrl"] == MAP_URL
    assert config["addressText"] == "г. Пермь, ул. Пионерская, 15"
    assert len(services) == 5 and len({s["slug"] for s in services}) == 5
    canonical = ["https://glaire.ru/"] + [f'https://glaire.ru/{s["slug"]}/' for s in services]
    paths = [ROOT / "index.html"] + [ROOT / s["slug"] / "index.html" for s in services]
    paths += [ROOT / s / "index.html" for s in ("glaire", "halloween", "halloween-bonus", "halloween-surprise")]
    results = []
    indexed_titles, indexed_descriptions = [], []
    root_sections = None
    for path in paths:
        source = path.read_text()
        page = Page(source)
        name = str(path.relative_to(ROOT))
        ids = [a["id"] for _, a in page.tags if "id" in a]
        assert not [k for k, v in Counter(ids).items() if v > 1], (name, "duplicate IDs")
        assert len(re.findall(r"<h1\b", source)) == 1, name
        meta = {a.get("name", a.get("property")): a.get("content", "") for a in page.find("meta")}
        for key in ("description", "robots", "og:title", "og:description", "og:url", "og:image", "twitter:title", "twitter:description"):
            assert sum(a.get("name", a.get("property")) == key for a in page.find("meta")) == 1, (name, key)
        url = page.find("link", rel="canonical")[0]["href"]
        title = re.search(r"<title>(.*?)</title>", source, re.S)[1]
        if url in canonical:
            assert meta["robots"].startswith("index,follow")
            indexed_titles.append(title)
            indexed_descriptions.append(meta["description"])
        else:
            assert "noindex" in meta["robots"]
        frame = page.find("iframe", id="mapFrame")[0]
        assert frame["src"] == MAP_URL and frame["loading"] == "eager", name
        sections = page.find("section")
        if root_sections is None:
            root_sections = sections
        assert sections == root_sections, (name, "section layout")
        assert 'class="footer-pages"' in source
        assert len(re.findall(r'<a href="[^\"]+"[^>]*>', re.search(r'<nav class="footer-pages".*?</nav>', source, re.S)[0])) == 6
        assert page.find("a", id="bookBtnHero")[0]["href"] == site["bookingUrl"]
        assert not re.search(r"Петропавловск\w*|бульвар\s+Гагарина|Советск\w*", source, re.I)
        graph = json.loads(re.search(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', source, re.S)[1])
        node = next(n for n in graph["@graph"] if n.get("@type") == "WebPage")
        assert node["url"] == url and node["name"] == title and node["description"] == meta["description"], name
        data = json.loads(re.search(r'<script\b[^>]*id="glairePageConfig"[^>]*>(.*?)</script>', source, re.S)[1])
        if data["slug"]:
            service = next(s for s in services if s["slug"] == data["slug"])
            assert data["text"] == service["text"]
            assert len(service["text"]["visitItems"].splitlines()) == 5
            assert "," not in service["text"]["visitItems"]
        local_assets = 0
        for tag, attrs in page.tags:
            if tag not in {"script", "link", "img"}:
                continue
            value = attrs.get("src" if tag in {"script", "img"} else "href", "")
            parsed = urlsplit(value)
            if value.startswith("/") and not value.startswith("//"):
                assert (ROOT / parsed.path.lstrip("/")).is_file(), (name, value)
                if parsed.path in {"/assets/site-runtime.js", "/assets/site.css"}:
                    digest = hashlib.sha256((ROOT / parsed.path.lstrip("/")).read_bytes()).hexdigest()[:12]
                    assert parsed.query == f"v={digest}", (name, "stale shared gallery resource", value)
                local_assets += 1
        results.append({"file": name, "canonical": url, "title": title, "local_assets": local_assets, "map_unchanged": True})
    assert len(set(indexed_titles)) == 6 and len(set(indexed_descriptions)) == 6
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    sitemap = ET.fromstring((ROOT / "sitemap.xml").read_bytes())
    assert [n.text for n in sitemap.findall("s:url/s:loc", ns)] == canonical
    for service in services:
        for old in service["oldSlugs"]:
            assert not (ROOT / old / "index.html").exists()
            assert f'^{old}' in (ROOT / ".htaccess").read_text()
    for path in [ROOT / "admin-panel.js", *ROOT.glob("assets/**/*.js")]:
        subprocess.run([shutil.which("node"), "--check", str(path)], check=True, capture_output=True)
    subprocess.run([shutil.which("node"), str(ROOT / "scripts/check-wheel.cjs")], check=True, capture_output=True)
    subprocess.run([shutil.which("node"), str(ROOT / "scripts/check-media-motion.cjs")], check=True, capture_output=True)
    if args.rebuild:
        before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [*paths, ROOT / "sitemap.xml"]}
        subprocess.run([shutil.which("python3"), str(ROOT / "scripts/build-site.py")], check=True, capture_output=True)
        assert before == {str(p): hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in before}, "Non-repeatable build"
    report = {"published": False, "indexable_pages": 6, "share_entries": 4, "checks": results, "rebuild_checked": args.rebuild}
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Проверено локально: {len(results)} страниц, 6 уникальных наборов SEO, карта/макет/ссылки, синтаксис JS, Sitemap.")


if __name__ == "__main__":
    main()
