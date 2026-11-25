import WidgetKit
import SwiftUI

// MARK: - Palette helpers

private func c(_ t: (r: Double, g: Double, b: Double), _ o: Double = 1) -> Color {
    Color(.sRGB, red: t.r, green: t.g, blue: t.b, opacity: o)
}
private let deepBG   = c(SW.deep)
private let midBG    = c(SW.mid)
private let brightBG = c(SW.bright)
private let teal     = c(SW.teal)
private let tealLt   = c(SW.tealLt)
private let gold     = c(SW.gold)
private let ember    = c(SW.ember)
private let violet   = c(SW.violet)
private let pink     = c(SW.pink)

// MARK: - Timeline

struct StreakEntry: TimelineEntry {
    let date: Date
    let data: StreakData
    let study: StudyData
    let learn: LearnData
    let week: WeekData
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), data: .sample, study: .sample, learn: .sample, week: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        if context.isPreview { completion(placeholder(in: context)); return }
        completion(entry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let now = Date()
        let cal = Calendar.current
        let nextMidnight = cal.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) ?? now.addingTimeInterval(3600)

        // Two entries, each resolved against the moment it will be shown. The
        // midnight one is built NOW, so the reset does not depend on the system
        // waking the extension on time — or on the app ever being opened.
        let entries = [entry(at: now), entry(at: nextMidnight)]
        let following = cal.date(byAdding: .day, value: 1, to: nextMidnight) ?? nextMidnight
        completion(Timeline(entries: entries, policy: .after(following)))
    }

    private func entry(at date: Date) -> StreakEntry {
        StreakEntry(date: date,
                    data: SharedStore.load().resolved(for: date),
                    study: SharedStore.loadStudy().resolved(for: date),
                    learn: SharedStore.loadLearn().resolved(for: date),
                    week: SharedStore.loadWeek())
    }
}

// MARK: - Pieces

/// Progress ring for today's completion (the Study widget still uses it).
struct Ring: View {
    var pct: Double
    var lineWidth: CGFloat = 9

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.11), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.02, min(1, pct)))
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [tealLt, teal, gold, tealLt]),
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(360)
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .shadow(color: teal.opacity(0.55), radius: 4)
        }
    }
}

/// Warm red until today is logged, settled blue once it is — so the widget
/// answers "have I done today?" from the home screen without being opened.
private func widgetBackground(done: Bool) -> some View {
    ZStack {
        if done {
            LinearGradient(
                colors: [deepBG, midBG, brightBG],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            RadialGradient(
                colors: [teal.opacity(0.10), .clear],
                center: .init(x: 0.18, y: 0.06), startRadius: 2, endRadius: 190
            )
            RadialGradient(
                colors: [gold.opacity(0.05), .clear],
                center: .init(x: 0.92, y: 1.0), startRadius: 2, endRadius: 170
            )
        } else {
            LinearGradient(
                colors: [Color(red: 0.22, green: 0.04, blue: 0.05),
                         Color(red: 0.15, green: 0.03, blue: 0.04),
                         Color(red: 0.09, green: 0.02, blue: 0.03)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            RadialGradient(
                colors: [Color(red: 0.90, green: 0.32, blue: 0.28).opacity(0.14), .clear],
                center: .init(x: 0.18, y: 0.06), startRadius: 2, endRadius: 170
            )
            RadialGradient(
                colors: [gold.opacity(0.05), .clear],
                center: .init(x: 0.92, y: 1.0), startRadius: 2, endRadius: 170
            )
        }
    }
}

// MARK: - The three habits, drawn together
// One picture instead of three dials side by side: three rings, one inside the next (Daily outside, Study, then Learn
// inside), the count of habits done today in the middle, each habit's streak beside it, and on the medium size the last
// seven days of each as a row of bars with the weekday under them. Numbers and shapes only.

enum Habit: Int, CaseIterable {
    case daily, study, learn

    var name: String { ["Daily", "Study", "Learn"][rawValue] }
    var icon: String { ["flame.fill", "book.fill", "lightbulb.fill"][rawValue] }
    /// The ring's sweep, and the colour of its icon and bars.
    var sweep: [Color] { [[ember, gold], [teal, tealLt], [violet, pink]][rawValue] }
    var tint: Color { [Color(red: 1.0, green: 0.66, blue: 0.34), tealLt, violet][rawValue] }
}

/// What one habit says about today.
struct HabitToday {
    var habit: Habit
    var streak: Int
    var pct: Double
    var done: Bool
}

extension StreakEntry {
    var habits: [HabitToday] {
        [HabitToday(habit: .daily, streak: data.current, pct: Double(data.todayPct) / 100, done: data.todayDone),
         HabitToday(habit: .study, streak: study.current, pct: Double(study.today) / Double(StudyData.chapters), done: study.done),
         HabitToday(habit: .learn, streak: learn.current, pct: Double(learn.todayPct) / 100, done: learn.done)]
    }
    var doneCount: Int { habits.filter { $0.done }.count }
}

private func cap(_ pct: Double, done: Bool) -> Double { done ? 1 : max(0, min(1, pct)) }

struct HabitRing: View {
    var item: HabitToday
    var lineWidth: CGFloat

    var body: some View {
        let sweep = max(0.02, cap(item.pct, done: item.done))
        ZStack {
            Circle().inset(by: lineWidth / 2).stroke(item.habit.tint.opacity(0.17), lineWidth: lineWidth)
            if item.pct > 0 || item.done {
                Circle().inset(by: lineWidth / 2)
                    .trim(from: 0, to: sweep)
                    .stroke(AngularGradient(colors: item.habit.sweep, center: .center,
                                            startAngle: .degrees(0), endAngle: .degrees(360 * sweep)),
                            style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: item.done ? item.habit.tint.opacity(0.6) : .clear, radius: 4)
            }
        }
    }
}

/// The three rings, Daily outside, and how many of the three are done in the middle.
struct HabitRings: View {
    var items: [HabitToday]
    var diameter: CGFloat
    var caption = false

    var body: some View {
        let w = diameter * 0.085, gap = w * 0.30
        let n = items.filter { $0.done }.count
        ZStack {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                let d = diameter - 2 * CGFloat(i) * (w + gap)
                HabitRing(item: item, lineWidth: w).frame(width: d, height: d)
            }
            VStack(spacing: 0) {
                Text("\(n)/3")
                    .font(.system(size: diameter * (caption ? 0.2 : 0.19), weight: .heavy, design: .rounded))
                    .foregroundStyle(.white).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                if caption {
                    Text("TODAY").font(.system(size: 7, weight: .heavy)).tracking(1).foregroundStyle(.white.opacity(0.62)).lineLimit(1).fixedSize()
                }
            }
            .frame(width: diameter - 4 * (w + gap) - 2 * w)
        }
        .frame(width: diameter, height: diameter)
    }
}

/// A habit's streak with its icon.
struct StreakChip: View {
    var item: HabitToday
    var size: CGFloat = 16

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: item.habit.icon)
                .font(.system(size: size * 0.7, weight: .semibold))
                .foregroundStyle(item.habit.tint)
            Text("\(item.streak)")
                .font(.system(size: size, weight: .heavy, design: .rounded))
                .foregroundStyle(item.streak > 0 ? Color.white : Color.white.opacity(0.45))
                .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }
    }
}

/// The last seven days of one habit: a bar a day, filled when it was done, today outlined until it is.
struct WeekBars: View {
    var days: [WeekDay]
    var habit: Habit
    var height: CGFloat = 20
    var width: CGFloat = 11

    private func done(_ d: WeekDay) -> Bool { [d.daily, d.study, d.learn][habit.rawValue] }

    var body: some View {
        HStack(spacing: 3.5) {
            ForEach(Array(days.enumerated()), id: \.offset) { _, d in
                let on = done(d)
                RoundedRectangle(cornerRadius: 3.5)
                    .fill(on ? AnyShapeStyle(LinearGradient(colors: habit.sweep, startPoint: .top, endPoint: .bottom))
                             : AnyShapeStyle(Color.white.opacity(0.10)))
                    .frame(width: width, height: height)
                    .overlay(RoundedRectangle(cornerRadius: 3.5).stroke(d.isToday && !on ? Color.white.opacity(0.6) : .clear, lineWidth: 1))
                    .shadow(color: on && d.isToday ? habit.tint.opacity(0.55) : .clear, radius: 3)
            }
        }
    }
}

struct WeekLetters: View {
    var days: [WeekDay]
    var width: CGFloat = 11

    var body: some View {
        HStack(spacing: 3.5) {
            ForEach(Array(days.enumerated()), id: \.offset) { _, d in
                Text(d.letter)
                    .font(.system(size: 8, weight: .heavy))
                    .foregroundStyle(d.isToday ? Color.white : Color.white.opacity(0.5))
                    .frame(width: width)
            }
        }
    }
}

// MARK: - Small

struct SmallView: View {
    var entry: StreakEntry
    var body: some View {
        VStack(spacing: 10) {
            HabitRings(items: entry.habits, diameter: 88)
            HStack(spacing: 0) {
                ForEach(Array(entry.habits.enumerated()), id: \.offset) { i, item in
                    if i > 0 { Spacer(minLength: 2) }
                    StreakChip(item: item, size: entry.habits.contains { $0.streak >= 100 } ? 14 : 16)
                }
            }
        }
    }
}

// MARK: - Medium

struct MediumView: View {
    var entry: StreakEntry
    var body: some View {
        let days = entry.week.days(7)
        HStack(spacing: 16) {
            HabitRings(items: entry.habits, diameter: 112, caption: true)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(entry.habits.enumerated()), id: \.offset) { _, item in
                    row(item, days)
                }
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    WeekLetters(days: days)
                }
            }
        }
    }

    private func row(_ item: HabitToday, _ days: [WeekDay]) -> some View {
        HStack(spacing: 7) {
            Image(systemName: item.habit.icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(item.habit.tint)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: -1) {
                Text("\(item.streak)")
                    .font(.system(size: 21, weight: .heavy, design: .rounded))
                    .foregroundStyle(item.streak > 0 ? Color.white : Color.white.opacity(0.45))
                    .monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Text(item.habit.name.uppercased())
                    .font(.system(size: 8, weight: .heavy)).tracking(1.1)
                    .foregroundStyle(item.done ? item.habit.tint : Color.white.opacity(0.62))
            }
            Spacer(minLength: 0)
            WeekBars(days: days, habit: item.habit, height: 24)
        }
    }
}

// MARK: - Lock screen

struct CircularView: View {
    var entry: StreakEntry
    var body: some View {
        let items = entry.habits
        ZStack {
            AccessoryWidgetBackground()
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                let d = 64 - CGFloat(i) * 12
                ZStack {
                    Circle().stroke(lineWidth: 3.5).opacity(0.25)
                    Circle().trim(from: 0, to: max(0.03, cap(item.pct, done: item.done)))
                        .stroke(style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: d, height: d)
            }
            Text("\(entry.doneCount)")
                .font(.system(size: 15, weight: .bold, design: .rounded))
        }
    }
}

struct RectangularView: View {
    var entry: StreakEntry
    var body: some View {
        HStack(spacing: 10) {
            ForEach(Array(entry.habits.enumerated()), id: \.offset) { _, item in
                VStack(spacing: 0) {
                    Image(systemName: item.habit.icon).font(.system(size: 11))
                    Text("\(item.streak)")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .monospacedDigit()
                }
                .opacity(item.done ? 1 : 0.7)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(entry.doneCount)/3")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                Text("today").font(.system(size: 10)).opacity(0.75)
            }
        }
    }
}

// MARK: - Entry view

struct StillwaterWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: StreakEntry

    var body: some View {
        Group {
            switch family {
            case .systemMedium:        MediumView(entry: entry)
            case .accessoryCircular:   CircularView(entry: entry)
            case .accessoryRectangular: RectangularView(entry: entry)
            case .accessoryInline:
                Label("\(entry.data.current) · \(entry.study.current) · \(entry.learn.current)", systemImage: "flame.fill")
            default:                   SmallView(entry: entry)
            }
        }
        .widgetURL(URL(string: "stillwater://daily"))
        .containerBackground(for: .widget) {
            switch family {
            case .accessoryCircular, .accessoryRectangular, .accessoryInline:
                Color.clear
            default:
                widgetBackground(done: entry.data.todayDone)
            }
        }
    }
}

// MARK: - Widget

struct StillwaterWidget: Widget {
    let kind = "StillwaterWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            StillwaterWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Streaks")
        .description("Daily, Study and Learn: three rings, each streak, and the week.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline
        ])
    }
}

// MARK: - Study streak (its own widget: add it from the gallery next to the daily one)

struct StudyEntry: TimelineEntry {
    let date: Date
    let data: StudyData
}

struct StudyProvider: TimelineProvider {
    func placeholder(in context: Context) -> StudyEntry { StudyEntry(date: Date(), data: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (StudyEntry) -> Void) {
        let d = context.isPreview ? StudyData.sample : SharedStore.loadStudy()
        completion(StudyEntry(date: Date(), data: d.resolved()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StudyEntry>) -> Void) {
        let stored = SharedStore.loadStudy()
        let now = Date()
        let cal = Calendar.current
        let nextMidnight = cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 5),
                                        matchingPolicy: .nextTime) ?? now.addingTimeInterval(3600)
        // Built now for both moments, so the reset at midnight never depends on the app being opened.
        let entries = [
            StudyEntry(date: now, data: stored.resolved(for: now)),
            StudyEntry(date: nextMidnight, data: stored.resolved(for: nextMidnight)),
        ]
        let following = cal.date(byAdding: .day, value: 1, to: nextMidnight) ?? nextMidnight
        completion(Timeline(entries: entries, policy: .after(following)))
    }
}

private func studyStatus(_ d: StudyData) -> String {
    if d.done { return "Study complete" }
    if d.today > 0 { return "\(d.today) of \(StudyData.chapters) chapters" }
    return d.current > 0 ? "Today's still open" : "Begin today"
}

/// Ring of the three chapters, with the streak in the middle.
struct StudyDial: View {
    var data: StudyData
    var diameter: CGFloat

    var body: some View {
        ZStack {
            Ring(pct: Double(data.today) / Double(StudyData.chapters), lineWidth: diameter * 0.082)
            VStack(spacing: 1) {
                Image(systemName: "book.fill")
                    .font(.system(size: diameter * 0.15, weight: .semibold))
                    .foregroundStyle(gold)
                Text("\(data.current)")
                    .font(.system(size: diameter * 0.40, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
        }
        .frame(width: diameter, height: diameter)
    }
}

struct StudySmallView: View {
    var data: StudyData
    var body: some View {
        VStack(spacing: 7) {
            StudyDial(data: data, diameter: 88)
            Text(studyStatus(data))
                .font(.system(size: 9.5, weight: .medium))
                .foregroundStyle(data.done ? tealLt.opacity(0.92) : gold.opacity(0.95))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

struct StudyMediumView: View {
    var data: StudyData
    var body: some View {
        HStack(spacing: 20) {
            StudyDial(data: data, diameter: 104)
            VStack(alignment: .leading, spacing: 11) {
                Text("Study")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                HStack(spacing: 16) {
                    stat("\(data.longest)", "best")
                    stat("\(data.total)", "days")
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text(studyStatus(data))
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(data.done ? tealLt.opacity(0.92) : gold.opacity(0.95))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    HStack(spacing: 5) {
                        ForEach(0..<StudyData.chapters, id: \.self) { i in
                            Capsule()
                                .fill(i < data.today
                                      ? AnyShapeStyle(LinearGradient(colors: [tealLt, teal, gold], startPoint: .leading, endPoint: .trailing))
                                      : AnyShapeStyle(Color.white.opacity(0.14)))
                                .frame(height: 6)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func stat(_ v: String, _ l: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(v)
                .font(.system(size: 17, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .monospacedDigit()
            Text(l.uppercased())
                .font(.system(size: 8.5, weight: .semibold))
                .kerning(1.1)
                .foregroundStyle(.white.opacity(0.72))
        }
    }
}

struct StudyCircularView: View {
    var data: StudyData
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Circle()
                .trim(from: 0, to: max(0.02, Double(data.today) / Double(StudyData.chapters)))
                .stroke(style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(3)
            VStack(spacing: -1) {
                Image(systemName: "book.fill").font(.system(size: 9))
                Text("\(data.current)")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .monospacedDigit()
            }
        }
    }
}

struct StudyRectangularView: View {
    var data: StudyData
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "book.fill").font(.system(size: 18))
            VStack(alignment: .leading, spacing: 1) {
                Text("\(data.current) day study streak")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                Text(studyStatus(data))
                    .font(.system(size: 11))
                    .opacity(0.75)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
        }
    }
}

struct StillwaterStudyEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: StudyEntry

    var body: some View {
        Group {
            switch family {
            case .systemMedium:         StudyMediumView(data: entry.data)
            case .accessoryCircular:    StudyCircularView(data: entry.data)
            case .accessoryRectangular: StudyRectangularView(data: entry.data)
            case .accessoryInline:
                Label("\(entry.data.current) day study streak", systemImage: "book.fill")
            default:                    StudySmallView(data: entry.data)
            }
        }
        .widgetURL(URL(string: "stillwater://study"))
        .containerBackground(for: .widget) {
            switch family {
            case .accessoryCircular, .accessoryRectangular, .accessoryInline:
                Color.clear
            default:
                widgetBackground(done: entry.data.done)
            }
        }
    }
}

struct StillwaterStudyWidget: Widget {
    let kind = "StillwaterStudyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StudyProvider()) { entry in
            StillwaterStudyEntryView(entry: entry)
        }
        .configurationDisplayName("Study Streak")
        .description("Your Bible study streak and today's three chapters.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline
        ])
    }
}

@main
struct StillwaterWidgetBundle: WidgetBundle {
    var body: some Widget {
        StillwaterWidget()
        StillwaterStudyWidget()
    }
}

// MARK: - Previews

#Preview(as: .systemSmall) {
    StillwaterWidget()
} timeline: {
    StreakEntry(date: .now, data: .sample, study: .sample, learn: .sample, week: .sample)
}

#Preview(as: .systemMedium) {
    StillwaterWidget()
} timeline: {
    StreakEntry(date: .now, data: .sample, study: .sample, learn: .sample, week: .sample)
}

#Preview(as: .systemSmall) {
    StillwaterStudyWidget()
} timeline: {
    StudyEntry(date: .now, data: .sample)
}

#Preview(as: .systemMedium) {
    StillwaterStudyWidget()
} timeline: {
    StudyEntry(date: .now, data: .sample)
}
