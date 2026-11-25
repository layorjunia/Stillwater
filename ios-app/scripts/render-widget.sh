#!/bin/bash
# Draws the widget's real views (the same Swift the phone runs) to PNGs on this Mac, so a layout is LOOKED AT, not guessed.
#
#   bash ios-app/scripts/render-widget.sh      ->  build/tmp/widget-render/*.png
#
# It stitches StillwaterShared.swift + StillwaterWidget.swift into one file, drops the parts that only make sense on the
# phone (@main, #Preview), adds a small harness, and compiles it for macOS. Sizes are the small widget at 158pt (the
# smallest phones) and 170pt, and the medium at 338x158.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHARED="$ROOT/ios-app/ios/App/Shared/StillwaterShared.swift"
WIDGET="$ROOT/ios-app/ios/App/StillwaterWidget/StillwaterWidget.swift"
OUT="$ROOT/build/tmp/widget-render"
rm -rf "$OUT"; mkdir -p "$OUT"

python3 - "$SHARED" "$WIDGET" "$OUT" <<'PY'
import re, sys
shared, widget, out = (open(sys.argv[1]).read(), open(sys.argv[2]).read(), sys.argv[3])
# phone-only parts
widget = widget[:widget.index('// MARK: - Previews')]
widget = re.sub(r'@main\s*struct StillwaterWidgetBundle: WidgetBundle \{.*?\n\}\n', '', widget, flags=re.S)
def drop(src, name):
    m = re.search(r'\nstruct ' + name + r'\b[^{]*\{', src)
    if not m: return src
    depth, i = 0, m.end() - 1
    while True:
        depth += {'{': 1, '}': -1}.get(src[i], 0)
        if depth == 0: break
        i += 1
    return src[:m.start()] + src[i + 1:]
# lock-screen sizes and the widget wrappers only exist on the phone
for n in ('StillwaterWidgetEntryView', 'StillwaterWidget', 'StillwaterStudyEntryView', 'StillwaterStudyWidget',
          'CircularView', 'RectangularView', 'StudyCircularView', 'StudyRectangularView'):
    widget = drop(widget, n)
harness = r'''
import AppKit

@MainActor func png<V: View>(_ view: V, _ w: CGFloat, _ h: CGFloat, _ path: String) {
    let r = ImageRenderer(content: view.frame(width: w, height: h))
    r.scale = 3
    guard let img = r.nsImage, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
          let data = rep.representation(using: .png, properties: [:]) else { print("FAILED", path); return }
    try? data.write(to: URL(fileURLWithPath: path))
    print("wrote", path)
}
@MainActor func tile<V: View>(_ done: Bool, _ v: V, _ w: CGFloat, _ h: CGFloat) -> some View {
    ZStack { widgetBackground(done: done); v.padding(16) }.frame(width: w, height: h).clipShape(RoundedRectangle(cornerRadius: 22))
}
func key(_ d: Int) -> String { StreakData.key(for: Calendar.current.date(byAdding: .day, value: d, to: Date())!) }
func daily(_ cur: Int, _ pct: Int, _ done: Bool) -> StreakData {
    StreakData(current: cur, longest: max(cur, 91), total: 91, todayPct: pct, todayDone: done, updatedAt: 0, dayKey: key(0), lastDoneDay: done ? key(0) : key(-1))
}
func study(_ cur: Int, _ today: Int) -> StudyData {
    StudyData(current: cur, longest: max(cur, 14), total: 31, today: today, done: today == 3, updatedAt: 0, dayKey: key(0), lastDoneDay: today == 3 ? key(0) : key(-1))
}
func learn(_ cur: Int, _ pct: Int) -> LearnData {
    LearnData(current: cur, longest: max(cur, 9), total: 20, todayPct: pct, done: pct >= 100, updatedAt: 0, dayKey: key(0), lastDoneDay: pct >= 100 ? key(0) : key(-1))
}
func week(_ d: [Int], _ s: [Int], _ l: [Int]) -> WeekData { WeekData(daily: d.map(key), study: s.map { key(-$0) }, learn: l.map { key(-$0) }) }
let out = CommandLine.arguments[1]
MainActor.assumeIsolated {
    let cases: [(String, StreakData, StudyData, LearnData, WeekData)] = [
        ("mixed", daily(12, 60, true), study(9, 2), learn(4, 60), week([0, -1, -2, -3, -4, -6].map { $0 }, [1, 2, 3, 5], [1, 2, 3])),
        ("all-done", daily(91, 100, true), study(5, 3), learn(7, 100), week([0, -1, -2, -3, -4, -5, -6], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5, 6])),
        ("open-day", daily(91, 0, false), study(30, 0), learn(14, 0), week([-1, -2, -3, -4, -5, -6], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4])),
        ("three-digits", daily(365, 100, true), study(120, 3), learn(100, 100), week([0, -1, -2, -3, -4, -5, -6], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6])),
        ("fresh", daily(0, 0, false), study(0, 0), learn(0, 0), week([], [], [])),
        ("learn-new", daily(91, 100, true), study(3, 1), learn(1, 100), week([0, -1, -2, -3, -4, -5, -6], [1, 2], [0])),
    ]
    for (name, d, s, l, w) in cases {
        let e = StreakEntry(date: Date(), data: d, study: s, learn: l, week: w)
        for size in [158.0, 170.0] {
            png(tile(d.todayDone, SmallView(entry: e), size, size), size, size, "\(out)/small-\(Int(size))-\(name).png")
        }
        png(tile(d.todayDone, MediumView(entry: e), 338, 158), 338, 158, "\(out)/medium-\(name).png")
    }
}
'''
open(out + '/main.swift', 'w').write(shared + '\n' + widget + '\n' + harness)
PY

( cd "$OUT" && swiftc -O -target arm64-apple-macos14.0 -o render main.swift 2> compile.log ) || { echo "COMPILE FAILED:"; grep -E "error" "$OUT/compile.log" | head -12; exit 1; }
( cd "$OUT" && ./render "$OUT" ) | sed "s#$ROOT/##"
