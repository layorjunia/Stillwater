#!/usr/bin/env python3
"""Write version.json from the app, and keep the loader's version in step.

The loader lives in its own file now (loader.html -> bundled as index.html).
If its BUNDLED constant drifts below the app's APP_VERSION, a stale cached
build can outrank the one baked into the binary, so this refuses to run.
"""
import re, json, datetime, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
app = (root / "Stillwater.html").read_text()
loader = (root / "loader.html").read_text()
v = re.search(r'const APP_VERSION = "([\d.]+)"', app).group(1)
b = re.search(r'var BUNDLED = "([\d.]+)"', loader).group(1)
assert v == b, f"APP_VERSION {v} != loader BUNDLED {b} — they must match"
(root / "version.json").write_text(json.dumps(
    {"version": v, "built": datetime.date.today().isoformat()}, indent=1) + "\n")
print(f"version.json -> {v}")
