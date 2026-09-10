#!/bin/bash
# Data-safety suite. Serves the app, then tells you what to run.
#
# The suite must be able to FAIL. To prove it still can, run it against an
# older build as a control:
#     git show <old-commit>:Stillwater.html > old.html   (then open old.html)
# v1.5.0 fails 6 of these, including the merge race that destroyed a day.
set -u
cd "$(dirname "$0")/.."
pkill -f "http.server 8777" 2>/dev/null; sleep 1
python3 -m http.server 8777 >/dev/null 2>&1 &
sleep 2
cat <<'MSG'
Serving on http://localhost:8777/Stillwater.html

Open it, then in the console:

    const src = await (await fetch('/tests/data-safety.js')).text();
    (0, eval)(src);
    await runAll();

Expect { failed: 0 }. Anything else is a data-loss risk — do not ship.
NOTE: run signed OUT. The suite writes to state; never point it at live data.
MSG
