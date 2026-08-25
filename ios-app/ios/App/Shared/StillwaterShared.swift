import Foundation

/// Streak snapshot written by the web app (through the Capacitor bridge)
/// and read by the Home Screen / Lock Screen widget.
/// Lives in an App Group so both processes can see it.
public struct StreakData: Codable, Equatable {
    public var current: Int
    public var longest: Int
    public var total: Int
    public var todayPct: Int
    public var todayDone: Bool
    public var updatedAt: Double
    /// Which local day this snapshot describes, and the last day fully
    /// completed. Optional so older stored payloads still decode.
    public var dayKey: String?
    public var lastDoneDay: String?

    public init(current: Int, longest: Int, total: Int,
                todayPct: Int, todayDone: Bool, updatedAt: Double,
                dayKey: String? = nil, lastDoneDay: String? = nil) {
        self.current = current
        self.longest = longest
        self.total = total
        self.todayPct = todayPct
        self.todayDone = todayDone
        self.updatedAt = updatedAt
        self.dayKey = dayKey
        self.lastDoneDay = lastDoneDay
    }

    /// yyyy-MM-dd in the device's own calendar and time zone.
    public static func key(for date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar.current
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// The widget must not trust a stored `todayDone` — the app may not have
    /// been opened since. Re-derive it against the date actually being drawn,
    /// so the ring empties at local midnight on its own.
    public func resolved(for date: Date = Date()) -> StreakData {
        guard let stamped = dayKey, !stamped.isEmpty else { return self }
        let today = StreakData.key(for: date)
        if stamped == today { return self }

        var d = self
        d.todayDone = false
        d.todayPct = 0
        let cal = Calendar.current
        let yesterday = cal.date(byAdding: .day, value: -1, to: date).map(StreakData.key(for:))
        // A run ending yesterday is still alive today until today ends.
        if let last = lastDoneDay, last == today || last == yesterday {
            // keep d.current
        } else {
            d.current = 0
        }
        return d
    }

    public static let empty = StreakData(
        current: 0, longest: 0, total: 0,
        todayPct: 0, todayDone: false, updatedAt: 0
    )

    /// Sample used for the widget gallery preview.
    public static let sample = StreakData(
        current: 12, longest: 21, total: 48,
        todayPct: 70, todayDone: true, updatedAt: 0,
        dayKey: StreakData.key(for: Date()), lastDoneDay: StreakData.key(for: Date())
    )
}

public enum SharedStore {
    /// Must match the App Group capability on BOTH targets.
    public static let appGroup = "group.com.illuminatedrones.stillwater"
    private static let key = "stillwater_streak"

    public static func load() -> StreakData {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.data(forKey: key),
            let value = try? JSONDecoder().decode(StreakData.self, from: raw)
        else { return .empty }
        return value
    }

    public static func save(_ value: StreakData) {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = try? JSONEncoder().encode(value)
        else { return }
        defaults.set(raw, forKey: key)
    }
}

/// Shared palette so the widget matches the app exactly.
public enum SW {
    public static let deep    = (r: 0.039, g: 0.145, b: 0.251)  // #0A2540
    public static let mid     = (r: 0.075, g: 0.227, b: 0.369)  // #133A5E
    public static let bright  = (r: 0.118, g: 0.353, b: 0.557)  // #1E5A8E
    public static let teal    = (r: 0.310, g: 0.765, b: 0.863)  // #4FC3DC
    public static let tealLt  = (r: 0.608, g: 0.929, b: 0.878)  // #9BEDE0
    public static let gold    = (r: 0.910, g: 0.722, b: 0.427)  // #E8B86D
    public static let ember   = (r: 0.949, g: 0.384, b: 0.165)  // #F2622A
}
