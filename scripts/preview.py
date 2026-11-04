"""Локальный просмотр GLAIRE: только 127.0.0.1, без загрузки на хостинг.

Повторяет маршруты старых страниц, 404 и закрытие исходников сборки.
Настоящие правила Apache дополнительно проверяются отдельной локальной копией.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
import argparse
import json
import posixpath

ROOT = Path(__file__).resolve().parents[1]
services = json.loads((ROOT / "content/services.json").read_text())
REDIRECTS = {old: item["slug"] for item in services for old in item["oldSlugs"]}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # При разработке изменения должны появляться после обычного обновления.
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def redirect(self, destination, code=301):
        self.send_response(code)
        self.send_header("Location", destination)
        self.end_headers()

    def send_head(self):
        url = urlsplit(self.path)
        path = posixpath.normpath(unquote(url.path))
        parts = path.strip("/").split("/")
        if parts[0] in {"scripts", "content", "docs"} or any(p.startswith(".") for p in parts):
            self.send_error(403)
            return None
        name = parts[-1].lower()
        if "backup" in name or "бэкап" in name or "до евента" in name or "до ивента" in name:
            self.send_error(403)
            return None
        slug = path.strip("/").removesuffix("/index.html")
        if slug in REDIRECTS:
            dest = "/" + REDIRECTS[slug] + "/"
            if url.query:
                dest += "?" + url.query
            self.redirect(dest)
            return None
        if path.endswith("/index.html"):
            dest = path.removesuffix("index.html")
            if url.query:
                dest += "?" + url.query
            self.redirect(dest)
            return None
        if path == "/" and parse_qs(url.query).get("wheel", [""])[0] in {"1", "halloween", "halloween-2026"}:
            self.redirect("/halloween-bonus/" + ("?" + url.query if url.query else ""), 302)
            return None
        return super().send_head()

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            data = (ROOT / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)
            return
        super().send_error(code, message, explain)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8768)
    args = parser.parse_args()
    print(f"Локальный просмотр: http://127.0.0.1:{args.port}/", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
