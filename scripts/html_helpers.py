"""Небольшие общие операции над готовым HTML, без браузера и сети."""
from html import unescape
import json
import re


def sync_webpage_graph(page):
    """Связывает JSON-LD WebPage с реальным title/description/canonical входа."""
    match = re.search(r'<script\b[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S)
    if not match:
        return page
    title = unescape(re.search(r'<title>(.*?)</title>', page, re.S)[1])
    description = unescape(re.search(r'<meta\b(?=[^>]*name="description")[^>]*content="([^"]*)"', page)[1])
    url = re.search(r'<link\b(?=[^>]*rel="canonical")[^>]*href="([^"]*)"', page)[1]
    graph = json.loads(match[1])
    node = next(n for n in graph["@graph"] if n.get("@type") == "WebPage")
    node.update({"@id": url + "#webpage", "url": url, "name": title, "description": description})
    return page[:match.start(1)] + json.dumps(graph, ensure_ascii=False, indent=2) + page[match.end(1):]
