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

// MARK: - Timeline

struct StreakEntry: TimelineEntry {
    let date: Date
    let data: StreakData
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), data: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        let d = context.isPreview ? StreakData.sample : SharedStore.load()
        completion(StreakEntry(date: Date(), data: d))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let entry = StreakEntry(date: Date(), data: SharedStore.load())
        // Redraw just after midnight so "today" resets even if the app never opens.
        let cal = Calendar.current
        let nextMidnight = cal.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 1, second: 0),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
    }
}

// MARK: - Pieces

/// Progress ring for today's completion.
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

struct Flame: View {
    var size: CGFloat = 15
    var body: some View {
        Image(systemName: "flame.fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(
                LinearGradient(colors: [Color(red: 1, green: 0.86, blue: 0.5), ember],
                               startPoint: .top, endPoint: .bottom)
            )
            .shadow(color: ember.opacity(0.75), radius: 5)
    }
}

/// The ring + streak number, used by both small and medium.
struct StreakDial: View {
    var data: StreakData
    var diameter: CGFloat
    var showFlame: Bool = true

    var body: some View {
        ZStack {
            Ring(pct: Double(data.todayPct) / 100.0, lineWidth: diameter * 0.082)
            VStack(spacing: 1) {
                if showFlame && data.current > 0 {
                    Flame(size: diameter * 0.15)
                }
                Text("\(data.current)")
                    .font(.system(size: diameter * 0.34, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text("DAY STREAK")
                    .font(.system(size: diameter * 0.077, weight: .semibold))
                    .kerning(0.7)
                    .foregroundStyle(.white.opacity(0.52))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
        }
        .frame(width: diameter, height: diameter)
    }
}

private var widgetBackground: some View {
    ZStack {
        LinearGradient(
            colors: [deepBG, midBG, brightBG],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        RadialGradient(
            colors: [teal.opacity(0.24), .clear],
            center: .init(x: 0.18, y: 0.06), startRadius: 2, endRadius: 190
        )
        RadialGradient(
            colors: [gold.opacity(0.11), .clear],
            center: .init(x: 0.92, y: 1.0), startRadius: 2, endRadius: 170
        )
    }
}

// MARK: - Small

struct SmallView: View {
    var data: StreakData
    var body: some View {
        VStack(spacing: 7) {
            StreakDial(data: data, diameter: 88)
            Text(statusLine(data))
                .font(.system(size: 9.5, weight: .medium))
                .foregroundStyle(data.todayDone ? tealLt.opacity(0.92) : gold.opacity(0.95))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Medium

struct MediumView: View {
    var data: StreakData
    var body: some View {
        HStack(spacing: 20) {
            StreakDial(data: data, diameter: 104)

            VStack(alignment: .leading, spacing: 11) {
                Text("Stillwater")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)

                HStack(spacing: 16) {
                    stat("\(data.longest)", "best")
                    stat("\(data.total)", "days")
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text(statusLine(data))
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(data.todayDone ? tealLt.opacity(0.92) : gold.opacity(0.95))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color.white.opacity(0.12))
                            Capsule()
                                .fill(LinearGradient(colors: [tealLt, teal, gold],
                                                     startPoint: .leading, endPoint: .trailing))
                                .frame(width: max(5, g.size.width * CGFloat(data.todayPct) / 100))
                                .shadow(color: teal.opacity(0.5), radius: 3)
                        }
                    }
                    .frame(height: 6)
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
                .foregroundStyle(.white.opacity(0.48))
        }
    }
}

// MARK: - Lock screen

struct CircularView: View {
    var data: StreakData
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Circle()
                .trim(from: 0, to: max(0.02, Double(data.todayPct) / 100))
                .stroke(style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(3)
            VStack(spacing: -1) {
                Image(systemName: "flame.fill").font(.system(size: 9))
                Text("\(data.current)")
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .monospacedDigit()
            }
        }
    }
}

struct RectangularView: View {
    var data: StreakData
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "flame.fill").font(.system(size: 18))
            VStack(alignment: .leading, spacing: 1) {
                Text("\(data.current) day streak")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                Text(statusLine(data))
                    .font(.system(size: 11))
                    .opacity(0.75)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Shared copy

private func statusLine(_ d: StreakData) -> String {
    if d.todayDone { return d.todayPct >= 100 ? "Today complete" : "Today counts · \(d.todayPct)%" }
    if d.current > 0 { return "Today's still open" }
    return "Begin today"
}

// MARK: - Entry view

struct StillwaterWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: StreakEntry

    var body: some View {
        Group {
            switch family {
            case .systemMedium:        MediumView(data: entry.data)
            case .accessoryCircular:   CircularView(data: entry.data)
            case .accessoryRectangular: RectangularView(data: entry.data)
            case .accessoryInline:
                Label("\(entry.data.current) day streak", systemImage: "flame.fill")
            default:                   SmallView(data: entry.data)
            }
        }
        .widgetURL(URL(string: "stillwater://daily"))
        .containerBackground(for: .widget) {
            switch family {
            case .accessoryCircular, .accessoryRectangular, .accessoryInline:
                Color.clear
            default:
                widgetBackground
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
        .configurationDisplayName("Daily Streak")
        .description("Your reflection streak and today's progress.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline
        ])
    }
}

@main
struct StillwaterWidgetBundle: WidgetBundle {
    var body: some Widget { StillwaterWidget() }
}

// MARK: - Previews

#Preview(as: .systemSmall) {
    StillwaterWidget()
} timeline: {
    StreakEntry(date: .now, data: .sample)
}

#Preview(as: .systemMedium) {
    StillwaterWidget()
} timeline: {
    StreakEntry(date: .now, data: .sample)
}
