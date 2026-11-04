"""Создать локальную поставку и manifest. Сетевых действий и публикации нет."""
from pathlib import Path
import argparse
import csv
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if output == ROOT or ROOT in output.parents or output.exists():
        parser.error("Нужна новая папка вне исходного проекта: существующие данные не перезаписываются.")
    services = json.loads((ROOT / "content/services.json").read_text())
    entries = ["index.html", "404.html", "admin-panel.js", "favicon.ico", ".htaccess",
               ".nojekyll", "robots.txt", "sitemap.xml", "site.webmanifest", "browserconfig.xml"]
    entries += [str(p.relative_to(ROOT)) for p in (ROOT / "assets").rglob("*")
                if p.is_file() and not p.name.startswith(".")]
    entries += [p.name for p in ROOT.glob("yandex_*.html")]
    entries += [f'{p["slug"]}/index.html' for p in services]
    entries += [f"{slug}/index.html" for slug in ("glaire", "halloween", "halloween-bonus", "halloween-surprise")]
    rows = []
    for relative in sorted(set(entries)):
        source = ROOT / relative
        if not source.is_file():
            raise FileNotFoundError(source)
        destination = output / "public" / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        rows.append({"path": relative, "bytes": source.stat().st_size,
                     "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    with (output / "manifest.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=["path", "bytes", "sha256"])
        writer.writeheader()
        writer.writerows(rows)
    (output / "LOCAL-ONLY.txt").write_text(
        "Локальная поставка GLAIRE. Не опубликована. Пункт 9 запрещён Валерой.\n"
        "Согласия на клиентские изображения и документы по данным остаются открытыми вопросами.\n")
    print(f"Локальная копия: {len(rows)} файлов, {sum(row['bytes'] for row in rows):,} байт. Ничего не опубликовано.")


if __name__ == "__main__":
    main()
