#!/bin/bash
# Checks the Learn streak and the week strip on their way to the widget, layer by layer.
#
#   1. the web page sends exactly the field names the Swift bridge reads
#   2. the shipped Swift (LearnData, WeekData) rolls over at midnight and slides the week along, run for real on this Mac
#   3. if the phone is reachable: the REAL payload in the App Group
#
# Usage:  bash ios-app/scripts/verify-learn-widget.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/Stillwater.html"
PLUGIN="$ROOT/ios-app/ios/App/App/StillwaterWidgetPlugin.swift"
SHARED="$ROOT/ios-app/ios/App/Shared/StillwaterShared.swift"
DEVICE="${STILLWATER_DEVICE:-4CEFC94E-E22D-5C9A-B14A-DDC94AE4E8C9}"
GROUP="group.com.illuminatedrones.stillwater"
mkdir -p "$ROOT/build/tmp"; TMP="$(mktemp -d "$ROOT/build/tmp/learn-widget.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
fails=0
say() { printf '%s  %s\n' "$1" "$2"; [ "$1" = "FAIL" ] && fails=$((fails+1)); }

echo "== 1. field names, web page vs Swift bridge =="
for f in learnCurrent learnLongest learnTotal learnPct learnDone learnDayKey learnLastDoneDay weekDaily weekStudy weekLearn; do
  inweb=$(sed -n '/function learnWidgetFields/,/^function learnPushWidget/p' "$APP" | grep -c "$f")
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

let a = LearnData(current: 3, longest: 6, total: 11, todayPct: 60, done: false, updatedAt: 0, dayKey: key(0), lastDoneDay: key(-1))
check("the same day: nothing changes", a.resolved(for: at(0)) == a)
let b = a.resolved(for: at(1))
check("next day: today's minutes empty", b.todayPct == 0 && b.done == false)
check("next day: a run that ended the day before yesterday is over", b.current == 0)
let c = LearnData(current: 3, longest: 6, total: 11, todayPct: 100, done: true, updatedAt: 0, dayKey: key(0), lastDoneDay: key(0))
check("done today: the run is alive the next morning", c.resolved(for: at(1)).current == 3 && c.resolved(for: at(1)).todayPct == 0)
check("two mornings on: a missed day ends it, best and total stay", c.resolved(for: at(2)).current == 0 && c.resolved(for: at(2)).longest == 6 && c.resolved(for: at(2)).total == 11)
let enc = try! JSONEncoder().encode(LearnData.sample)
check("a stored payload decodes to what was stored", (try! JSONDecoder().decode(LearnData.self, from: enc)) == LearnData.sample)
check("empty stays empty", LearnData.empty.resolved(for: at(5)) == LearnData.empty)

// the week: seven days ending on the day drawn, oldest first, and it slides along when the day does
let w = WeekData(daily: [key(0), key(-1), key(-3)], study: [key(-1)], learn: [key(0), key(-2)])
let d0 = w.days(7, endingOn: at(0))
check("seven days", d0.count == 7)
check("the last is today", d0.last!.isToday && d0.last!.key == key(0) && d0.filter { $0.isToday }.count == 1)
check("oldest first, one day apart", d0.first!.key == key(-6) && d0[5].key == key(-1))
check("flags follow the habit", d0.last!.daily && !d0.last!.study && d0.last!.learn && d0[5].study && !d0[4].daily && d0[3].daily == true)
let d1 = w.days(7, endingOn: at(1))
check("tomorrow the strip slides: today is empty and yesterday keeps today's marks", !d1.last!.daily && !d1.last!.learn && d1[5].daily && d1[5].learn)
check("a day that fell off the left is gone", d1.first!.key == key(-5))
check("the weekday letters are the real weekdays", d0.map { $0.letter }.joined() == (0..<7).map { i -> String in
    let wd = Calendar.current.component(.weekday, from: at(i - 6)); return String(Array("SMTWTFS")[wd - 1]) }.joined())
check("no history draws an empty strip", WeekData.empty.days(7).allSatisfy { !$0.daily && !$0.study && !$0.learn })
let encW = try! JSONEncoder().encode(WeekData.sample)
check("a stored week decodes to what was stored", (try! JSONDecoder().decode(WeekData.self, from: encW)) == WeekData.sample)
print(fails == 0 ? "ALL SWIFT CHECKS PASSED" : "\\(fails) SWIFT CHECKS FAILED")
exit(fails == 0 ? 0 : 1)
''')
PY
if swiftc -o "$TMP/check" "$TMP/check.swift" 2>"$TMP/swiftc.log" && "$TMP/check"; then :; else echo "FAIL  the Swift check did not pass"; head -5 "$TMP/swiftc.log"; fails=$((fails+1)); fi

echo; echo "== 3. the real payload on the phone =="
if xcrun devicectl device copy from --device "$DEVICE" --domain-type appGroupDataContainer --domain-identifier "$GROUP" \
     --source "Library/Preferences" --destination "$TMP/group" 2>&1 | grep -q "File received"; then
  python3 - "$TMP/group" <<'PY'
import plistlib, json, glob, sys
found = {}
for f in glob.glob(sys.argv[1] + "/**/*.plist", recursive=True):
    try: p = plistlib.load(open(f, 'rb'))
    except Exception: continue
    for k in ('stillwater_learn_streak', 'stillwater_week'):
        if p.get(k) is not None: found[k] = json.loads(p[k].decode() if isinstance(p[k], bytes) else p[k])
for k in ('stillwater_learn_streak', 'stillwater_week'):
    print(("PASS  the phone holds " if k in found else "FAIL  no ") + k + (": " + json.dumps(found[k])[:160] if k in found else " in the App Group yet (open the app on the phone once, then run this again)"))
PY
else
  echo "SKIP  the phone could not be reached (it needs the cable)"
fi
echo; [ "$fails" -eq 0 ] && echo "OK" || { echo "$fails check(s) failed"; exit 1; }
