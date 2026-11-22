#!/bin/bash
# Checks the Study streak's path to the widget, layer by layer, and that its midnight rollover is right.
#
#   1. the web page sends exactly the field names the Swift bridge reads (the layer that silently dropped fields before)
#   2. the shipped Swift (StudyData) rolls over at midnight the way the daily streak does, run for real on this Mac
#   3. if the phone is reachable: the REAL payload in the App Group, run through the same Swift
#
# Usage:  bash ios-app/scripts/verify-study-widget.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/Stillwater.html"
PLUGIN="$ROOT/ios-app/ios/App/App/StillwaterWidgetPlugin.swift"
SHARED="$ROOT/ios-app/ios/App/Shared/StillwaterShared.swift"
DEVICE="${STILLWATER_DEVICE:-4CEFC94E-E22D-5C9A-B14A-DDC94AE4E8C9}"
GROUP="group.com.illuminatedrones.stillwater"
mkdir -p "$ROOT/build/tmp"; TMP="$(mktemp -d "$ROOT/build/tmp/study-widget.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
fails=0
say() { printf '%s  %s\n' "$1" "$2"; [ "$1" = "FAIL" ] && fails=$((fails+1)); }

echo "== 1. field names, web page vs Swift bridge =="
for f in studyCurrent studyLongest studyTotal studyToday studyDone studyDayKey studyLastDoneDay; do
  inweb=$(sed -n '/function studyWidgetFields/,/^}/p' "$APP" | grep -c "$f")
  inup=$(sed -n '/@objc func update/,/@objc func read/p' "$PLUGIN" | grep -c "\"$f\"")
  inread=$(sed -n '/@objc func read/,$p' "$PLUGIN" | grep -c "\"$f\"")
  if [ "$inweb" -ge 1 ] && [ "$inup" -ge 1 ] && [ "$inread" -ge 1 ]; then say PASS "$f is sent, read and handed back"; else say FAIL "$f  web:$inweb update:$inup read:$inread"; fi
done

echo; echo "== 2. the shipped Swift, run here =="
python3 - "$SHARED" "$TMP" <<'PY'
import sys
src = open(sys.argv[1]).read()
body = src[src.index('public struct StreakData'):src.index('public enum SharedStore')]
open(sys.argv[2] + '/check.swift', 'w').write("import Foundation\n\n" + body + '''
func at(_ d: Int) -> Date { Calendar.current.date(byAdding: .day, value: d, to: Date())! }
func key(_ d: Int) -> String { StreakData.key(for: at(d)) }
var fails = 0
func check(_ name: String, _ ok: Bool) { print((ok ? "PASS  " : "FAIL  ") + name); if !ok { fails += 1 } }

// two of three chapters read today; yesterday was the last full day; a run of 5
let a = StudyData(current: 5, longest: 9, total: 20, today: 2, done: false, updatedAt: 0, dayKey: key(0), lastDoneDay: key(-1))
check("the same day: nothing changes", a.resolved(for: at(0)) == a)
let b = a.resolved(for: at(1))
check("next day: chapters read today empty", b.today == 0 && b.done == false)
check("next day: a run that ended the day before yesterday is over", b.current == 0)
// finished today
let c = StudyData(current: 5, longest: 9, total: 20, today: 3, done: true, updatedAt: 0, dayKey: key(0), lastDoneDay: key(0))
check("finished today: still counts today", c.resolved(for: at(0)).done && c.resolved(for: at(0)).current == 5)
check("next morning: the run is alive until the day ends", c.resolved(for: at(1)).current == 5 && c.resolved(for: at(1)).today == 0)
check("two mornings on: a missed day ends it", c.resolved(for: at(2)).current == 0)
check("best and total are kept when a run ends", c.resolved(for: at(2)).longest == 9 && c.resolved(for: at(2)).total == 20)
// what the bridge stores comes back the same
let d = StudyData.sample
let enc = try! JSONEncoder().encode(d)
check("a stored payload decodes to what was stored", (try! JSONDecoder().decode(StudyData.self, from: enc)) == d)
// an older payload with no day stamp falls back on the time it was written
let old = StudyData(current: 4, longest: 4, total: 4, today: 3, done: true, updatedAt: Date().addingTimeInterval(-3 * 86400).timeIntervalSince1970 * 1000)
check("no day stamp: it still ages out", old.resolved().today == 0 && old.resolved().current == 0)
check("empty stays empty", StudyData.empty.resolved(for: at(5)) == StudyData.empty)
check("three chapters make a day", StudyData.chapters == 3)
print(fails == 0 ? "ALL SWIFT CHECKS PASSED" : "\\(fails) SWIFT CHECKS FAILED")
exit(fails == 0 ? 0 : 1)
''')
PY
if swiftc -o "$TMP/check" "$TMP/check.swift" 2>"$TMP/swiftc.log" && "$TMP/check"; then :; else echo "FAIL  the Swift check did not pass"; cat "$TMP/swiftc.log" | head -5; fails=$((fails+1)); fi

echo; echo "== 3. the real payload on the phone =="
if xcrun devicectl device copy from --device "$DEVICE" --domain-type appGroupDataContainer --domain-identifier "$GROUP" \
     --source "Library/Preferences" --destination "$TMP/group" 2>&1 | grep -q "File received"; then
  python3 - "$TMP/group" <<'PY'
import plistlib, json, glob, sys
for f in glob.glob(sys.argv[1] + "/**/*.plist", recursive=True):
    try: p = plistlib.load(open(f, 'rb'))
    except Exception: continue
    v = p.get('stillwater_study_streak')
    if v is None: continue
    d = json.loads(v.decode() if isinstance(v, bytes) else v)
    print("PASS  the phone holds a Study payload:", json.dumps({k: d[k] for k in ('current', 'longest', 'total', 'today', 'done', 'dayKey', 'lastDoneDay') if k in d}))
    break
else:
    print("FAIL  no Study payload in the App Group yet (open the app on the phone once, then run this again)")
PY
else
  echo "SKIP  the phone could not be reached (it needs the cable)"
fi
echo; [ "$fails" -eq 0 ] && echo "OK" || { echo "$fails check(s) failed"; exit 1; }
