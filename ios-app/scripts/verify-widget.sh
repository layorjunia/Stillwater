#!/bin/bash
# End-to-end check of the Home Screen widget's day rollover.
#
# Reads the REAL payload out of the App Group on the phone and runs it through
# the REAL shipped Swift, stepped forward in time. Exists because the widget was
# declared fixed three times on the strength of unit tests over invented data,
# while the actual bytes reaching the widget were the wrong shape entirely.
#
# Usage:  bash ios-app/scripts/verify-widget.sh
set -u

DEVICE="${STILLWATER_DEVICE:-4CEFC94E-E22D-5C9A-B14A-DDC94AE4E8C9}"
GROUP="group.com.illuminatedrones.stillwater"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHARED="$ROOT/ios-app/ios/App/Shared/StillwaterShared.swift"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== pulling the App Group container off the device =="
if ! xcrun devicectl device copy from --device "$DEVICE" \
      --domain-type appGroupDataContainer --domain-identifier "$GROUP" \
      --source "Library/Preferences" --destination "$TMP" 2>&1 | grep -q "File received"; then
  echo "FAIL: could not read the device. Is it awake and on Wi-Fi?"
  exit 1
fi

PAYLOAD="$(python3 - "$TMP" <<'PY'
import plistlib, json, glob, sys
for f in glob.glob(sys.argv[1] + "/**/*.plist", recursive=True):
    try: p = plistlib.load(open(f, 'rb'))
    except Exception: continue
    v = p.get('stillwater_streak')
    if v is None: continue
    print(json.dumps(json.loads(v.decode() if isinstance(v, bytes) else v)))
    break
PY
)"

if [ -z "$PAYLOAD" ]; then echo "FAIL: no widget payload in the App Group."; exit 1; fi
echo "payload the widget actually reads:"
echo "  $PAYLOAD"
echo

python3 - "$SHARED" "$PAYLOAD" "$TMP" <<'PY'
import sys
shared, payload, tmp = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(shared).read()
body = src[src.index('public struct StreakData'):src.index('public enum SharedStore')]
esc = payload.replace('"', '\\"')
open(tmp + '/check.swift', 'w').write("import Foundation\n\n" + body + f'''
let data = try! JSONDecoder().decode(StreakData.self, from: Data("{esc}".utf8))
func at(_ d: Int) -> Date {{ Calendar.current.date(byAdding: .day, value: d, to: Date())! }}
let f = DateFormatter(); f.dateFormat = "EEE d MMM"; f.timeZone = .current

var fails = 0
func check(_ name: String, _ ok: Bool) {{
    print((ok ? "PASS  " : "FAIL  ") + name); if !ok {{ fails += 1 }}
}}
for d in 0...2 {{
    let r = data.resolved(for: at(d))
    print(String(format: "  %@  todayDone=%@ ring=%d%% streak=%d",
                 f.string(from: at(d)), r.todayDone ? "true " : "false", r.todayPct, r.current))
}}
print("")
let t = data.resolved(for: at(1))
check("ring empties tomorrow without opening the app", t.todayDone == false && t.todayPct == 0)
check("a run completed today survives tomorrow",       !data.todayDone || t.current == data.current)
let t2 = data.resolved(for: at(2))
check("run breaks after a full day is missed",         t2.current == 0)
exit(fails == 0 ? 0 : 1)
''')
PY

swift "$TMP/check.swift"
RC=$?
echo
[ $RC -eq 0 ] && echo "== widget rollover VERIFIED against live device data ==" \
              || echo "== VERIFICATION FAILED — do not claim this works =="
exit $RC
