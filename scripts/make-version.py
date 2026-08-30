#!/usr/bin/env python3
"""Write version.json next to Stillwater.html, from the APP_VERSION in it."""
import re, json, datetime, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "Stillwater.html").read_text()
v = re.search(r'const APP_VERSION = "([\d.]+)"', html).group(1)
b = re.search(r'window\.__SW_BUNDLED_VERSION = "([\d.]+)"', html).group(1)
assert v == b, f"APP_VERSION {v} != loader version {b} — they must match"
(root / "version.json").write_text(json.dumps(
    {"version": v, "built": datetime.date.today().isoformat()}, indent=1) + "\n")
print(f"version.json -> {v}")
