"""Одна локальная сборка GLAIRE. Ничего не загружает и не публикует.

1. Метаданные главной из content/site.json.
2. Начальный HTML из CONFIG_DEFAULT общего runtime.
3. Входы колеса и социальных карточек.
4. Пять направлений из content/services.json.
5. Sitemap с шестью основными страницами.
"""
from pathlib import Path
from runpy import run_path
import json
import re
import hashlib
from html import escape

ROOT = Path(__file__).resolve().parents[1]
# Один праздничный вход: конфигурация → класс колеса → оформление → звук.
# Так ранний выход одного файла не зависит от порядка нескольких загрузок.
event_parts = ["assets/events/halloween/event-config.js", "assets/events/fortune-wheel.js",
               "assets/events/halloween/halloween.js", "assets/events/halloween/halloween-audio.js"]
event_bundle = "/* Автоматически собрано scripts/build-site.py. Редактируйте исходные файлы, не этот результат. */\n"
for relative in event_parts:
    event_bundle += f"\n/* Источник: {relative} */\n" + (ROOT / relative).read_text() + "\n;\n"
(ROOT / "assets/events/halloween/event-layer.js").write_text(event_bundle)
# Версия ресурса меняется от его содержимого: кеш не возвращает старый код.
home_path = ROOT / "index.html"
home = home_path.read_text()
def version_resource(match):
    path = ROOT / match[2].lstrip("/")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    return match[1] + match[2] + "?v=" + digest + match[3]
home = re.sub(r'((?:src|href)=")(/assets/[^"?]+)\?v=[^"]*(")', version_resource, home)
home_path.write_text(home)
for filename in ("update-root-meta.py", "build-halloween-entry.py", "build-service-pages.py"):
    run_path(str(ROOT / "scripts" / filename), run_name="__main__")

site = json.loads((ROOT / "content/site.json").read_text())
services = json.loads((ROOT / "content/services.json").read_text())
sitemap_path = ROOT / "sitemap.xml"
source = sitemap_path.read_text()
main = next(item for item in re.findall(r"  <url>.*?  </url>", source, re.S)
            if "<loc>https://glaire.ru/</loc>" in item)
main = re.sub(r"<lastmod>.*?</lastmod>", f'<lastmod>{site["updatedAt"]}</lastmod>', main, count=1)
entries = [main]
for service in services:
    entries.append(
        '  <url>\n'
        f'    <loc>https://glaire.ru/{service["slug"]}/</loc>\n'
        f'    <lastmod>{service["updatedAt"]}</lastmod>\n'
        '    <image:image>\n'
        '      <image:loc>https://glaire.ru/assets/images/IMG_3907_h6ghr5.heic-1280-v1793126750.webp</image:loc>\n'
        f'      <image:title>{escape("Студия GLAIRE — " + service["label"] + " в Перми, Пионерская, 15")}</image:title>\n'
        '    </image:image>\n'
        '  </url>')
sitemap_path.write_text(source[:source.index("  <url>")] + "\n".join(entries) + "\n</urlset>\n")
print("Готово локально: главная, пять направлений, четыре входа и Sitemap. Публикация не выполнялась.")
