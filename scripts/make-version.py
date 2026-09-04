#!/usr/bin/env python3
"""Write version.json from the app, and keep the loader from outranking it.

The loader lives in its own file (loader.html -> bundled as index.html). It may
LAG the app — that is normal for an over-the-air release, where only the app
changes. It must never be AHEAD of it, or the loader would discard the very
update it is meant to apply. bundle-web.js stamps the loader to match whenever
a native build is made.
"""
import re, json, datetime, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
app = (root / "Stillwater.html").read_text()
loader = (root / "loader.html").read_text()
v = re.search(r'const APP_VERSION = "([\d.]+)"', app).group(1)
b = re.search(r'var BUNDLED = "([\d.]+)"', loader).group(1)
def parts(x): return [int(n) for n in x.split(".")]
assert parts(b) <= parts(v), (
    f"loader BUNDLED {b} outranks APP_VERSION {v} — a cached update would be "
    "discarded as stale. The loader must never be ahead of the app.")
(root / "version.json").write_text(json.dumps(
    {"version": v, "built": datetime.date.today().isoformat()}, indent=1) + "\n")
print(f"version.json -> {v}")
