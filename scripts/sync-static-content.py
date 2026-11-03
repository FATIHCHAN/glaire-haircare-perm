"""Keep crawlable HTML text in sync with the site's editable defaults.

This is a build step, not browser code. It preserves element attributes,
styles, media loading and the map. Visitors and crawlers receive the same
text before JavaScript runs; the existing editor continues to work.
"""
from html import escape
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "index.html"
source = path.read_text()
start = source.index("const STUDIO_PHOTOS =")
end = source.index("const STUDIO_SOCIAL_LINKS =", start)
node = shutil.which("node") or "/usr/local/bin/node"
program = """const vm = require('node:vm');
const fs = require('node:fs');
const declarations = fs.readFileSync(0, 'utf8');
process.stdout.write(vm.runInNewContext(
  declarations + '\\nJSON.stringify(CONFIG_DEFAULT)', Object.create(null),
  {timeout: 1000}));
"""
config = json.loads(subprocess.run(
    [node, "-e", program], input=source[start:end], text=True,
    capture_output=True, check=True).stdout)
# The first work is rendered after the editable bindings at runtime.
catalog = source[source.index("const WORKS_PROCEDURE_CATALOG ="):]
first_note = json.loads(re.search(r'\bnote:\s*("(?:[^"\\]|\\.)*")', catalog)[1])

class Bindings(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.lines = [0]
        for match in re.finditer("\n", source): self.lines.append(match.end())
        self.stack = []; self.edits = []

    def absolute_position(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID: return
        attrs = dict(attrs)
        replacement = None
        key = attrs.get("data-edit")
        ident = attrs.get("id", "")
        if key in config:
            replacement = escape(str(config[key]))
        if re.fullmatch(r"(?:news|content)(?:Title|Text|Badge)\d+", ident):
            replacement = escape(str(config[ident]))
        if ident == "worksProcedureNote": replacement = escape(first_note)
        lists = {
            "bonusList": ("bonusSideList", "li", ""),
            "visitList": ("visitItems", "div", "future-item"),
            "worksTags": ("worksTags", "span", "work-tag"),
        }
        if ident in lists:
            field, item_tag, item_class = lists[ident]
            attr = f' class="{item_class}"' if item_class else ""
            replacement = "\n".join(
                f"<{item_tag}{attr}>{escape(item.strip())}</{item_tag}>"
                for item in config[field].splitlines() if item.strip())
        self.stack.append((tag, self.absolute_position() + len(self.get_starttag_text()), replacement))

    def handle_endtag(self, tag):
        match = next((i for i in range(len(self.stack)-1, -1, -1)
                      if self.stack[i][0] == tag), None)
        if match is None: return
        _, begin, replacement = self.stack[match]
        del self.stack[match:]
        if replacement is not None:
            self.edits.append((begin, self.absolute_position(), replacement))

parser = Bindings()
parser.feed(source)
updated = source
changed = 0
for begin, end, replacement in sorted(parser.edits, reverse=True):
    if source[begin:end] != replacement: changed += 1
    updated = updated[:begin] + replacement + updated[end:]
if updated != source: path.write_text(updated)
print(f"Static content: {len(parser.edits)} bindings checked; {changed} updated")
