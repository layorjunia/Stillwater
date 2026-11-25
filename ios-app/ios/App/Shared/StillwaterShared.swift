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
        // Prefer the explicit day stamp; fall back to the write timestamp so a
        // payload written by an older build still ages out instead of showing
        // yesterday's completion forever.
        let stamped: String
        if let k = dayKey, !k.isEmpty {
            stamped = k
        } else if updatedAt > 0 {
            stamped = StreakData.key(for: Date(timeIntervalSince1970: updatedAt / 1000))
        } else {
            return self
        }
        let today = StreakData.key(for: date)
        if stamped == today { return self }

        var d = self
        d.todayDone = false
        d.todayPct = 0
        let cal = Calendar.current
        let yesterday = cal.date(byAdding: .day, value: -1, to: date).map(StreakData.key(for:))
        // A run ending yesterday is still alive today until today ends. With no
        // lastDoneDay recorded, fall back to the day the payload was written.
        let last = (lastDoneDay?.isEmpty == false) ? lastDoneDay : (todayDone ? stamped : nil)
        if let last = last, last == today || last == yesterday {
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

/// The Bible study streak: its own number, apart from the daily one. A study day is three chapters read.
/// Written by the web app through the same bridge, under its own key, so nothing about the daily widget changes.
public struct StudyData: Codable, Equatable {
    public var current: Int
    public var longest: Int
    public var total: Int
    /// Chapters read today, 0 to `chapters`.
    public var today: Int
    public var done: Bool
    public var updatedAt: Double
    public var dayKey: String?
    public var lastDoneDay: String?

    public static let chapters = 3

    public init(current: Int, longest: Int, total: Int, today: Int, done: Bool,
                updatedAt: Double, dayKey: String? = nil, lastDoneDay: String? = nil) {
        self.current = current
        self.longest = longest
        self.total = total
        self.today = today
        self.done = done
        self.updatedAt = updatedAt
        self.dayKey = dayKey
        self.lastDoneDay = lastDoneDay
    }

    /// Same rule as the daily streak: the widget never trusts a stored "today". Re-derived against the date
    /// being drawn, so the count empties at local midnight on its own, and a run that ended yesterday is
    /// still alive until today ends.
    public func resolved(for date: Date = Date()) -> StudyData {
        let stamped: String
        if let k = dayKey, !k.isEmpty {
            stamped = k
        } else if updatedAt > 0 {
            stamped = StreakData.key(for: Date(timeIntervalSince1970: updatedAt / 1000))
        } else {
            return self
        }
        let todayKey = StreakData.key(for: date)
        if stamped == todayKey { return self }

        var d = self
        d.today = 0
        d.done = false
        let cal = Calendar.current
        let yesterday = cal.date(byAdding: .day, value: -1, to: date).map(StreakData.key(for:))
        let last = (lastDoneDay?.isEmpty == false) ? lastDoneDay : (done ? stamped : nil)
        if let last = last, last == todayKey || last == yesterday {
            // keep d.current
        } else {
            d.current = 0
        }
        return d
    }

    public static let empty = StudyData(current: 0, longest: 0, total: 0, today: 0, done: false, updatedAt: 0)

    /// Sample used for the widget gallery preview.
    public static let sample = StudyData(
        current: 9, longest: 14, total: 31, today: 2, done: false, updatedAt: 0,
        dayKey: StreakData.key(for: Date()), lastDoneDay: StreakData.key(for: Date().addingTimeInterval(-86400))
    )
}

/// The Learn streak: five active minutes a day. Same midnight rule as Study (the widget never trusts a stored "today"), and
/// `todayPct` is how much of the five minutes is done, 0 to 100.
public struct LearnData: Codable, Equatable {
    public var current: Int
    public var longest: Int
    public var total: Int
    public var todayPct: Int
    public var done: Bool
    public var updatedAt: Double
    public var dayKey: String?
    public var lastDoneDay: String?

    public init(current: Int, longest: Int, total: Int, todayPct: Int, done: Bool,
                updatedAt: Double, dayKey: String? = nil, lastDoneDay: String? = nil) {
        self.current = current
        self.longest = longest
        self.total = total
        self.todayPct = todayPct
        self.done = done
        self.updatedAt = updatedAt
        self.dayKey = dayKey
        self.lastDoneDay = lastDoneDay
    }

    public func resolved(for date: Date = Date()) -> LearnData {
        let stamped: String
        if let k = dayKey, !k.isEmpty {
            stamped = k
        } else if updatedAt > 0 {
            stamped = StreakData.key(for: Date(timeIntervalSince1970: updatedAt / 1000))
        } else {
            return self
        }
        let todayKey = StreakData.key(for: date)
        if stamped == todayKey { return self }

        var d = self
        d.todayPct = 0
        d.done = false
        let cal = Calendar.current
        let yesterday = cal.date(byAdding: .day, value: -1, to: date).map(StreakData.key(for:))
        let last = (lastDoneDay?.isEmpty == false) ? lastDoneDay : (done ? stamped : nil)
        if let last = last, last == todayKey || last == yesterday {
            // keep d.current
        } else {
            d.current = 0
        }
        return d
    }

    public static let empty = LearnData(current: 0, longest: 0, total: 0, todayPct: 0, done: false, updatedAt: 0)

    /// Sample used for the widget gallery preview.
    public static let sample = LearnData(
        current: 4, longest: 6, total: 11, todayPct: 60, done: false, updatedAt: 0,
        dayKey: StreakData.key(for: Date()), lastDoneDay: StreakData.key(for: Date().addingTimeInterval(-86400))
    )
}

/// One day of the week strip: which of the three habits were done on it.
public struct WeekDay: Equatable {
    public var key: String
    public var letter: String
    public var isToday: Bool
    public var daily: Bool
    public var study: Bool
    public var learn: Bool
}

/// The last fourteen days each habit was done, as the day keys the page sends. The strip is worked out from the day the
/// widget is DRAWING, so it slides along at midnight on its own, like the streaks do.
public struct WeekData: Codable, Equatable {
    public var daily: [String]
    public var study: [String]
    public var learn: [String]

    public init(daily: [String] = [], study: [String] = [], learn: [String] = []) {
        self.daily = daily
        self.study = study
        self.learn = learn
    }

    public static let empty = WeekData()

    /// The `n` days ending on `date`, oldest first.
    public func days(_ n: Int = 7, endingOn date: Date = Date()) -> [WeekDay] {
        let cal = Calendar.current
        let d = Set(daily), s = Set(study), l = Set(learn)
        let letters = Array("SMTWTFS")
        return (0..<n).reversed().compactMap { back -> WeekDay? in
            guard let day = cal.date(byAdding: .day, value: -back, to: date) else { return nil }
            let k = StreakData.key(for: day)
            let wd = cal.component(.weekday, from: day)            // Sunday is 1
            return WeekDay(key: k, letter: String(letters[(wd - 1) % 7]), isToday: back == 0,
                           daily: d.contains(k), study: s.contains(k), learn: l.contains(k))
        }
    }

    /// Sample used for the widget gallery preview.
    public static var sample: WeekData {
        func ago(_ n: Int) -> String { StreakData.key(for: Date().addingTimeInterval(Double(-n) * 86400)) }
        return WeekData(daily: [0, 1, 2, 3, 4, 6].map(ago), study: [1, 2, 3, 5].map(ago), learn: [1, 2, 3].map(ago))
    }
}

public enum SharedStore {
    /// Must match the App Group capability on BOTH targets.
    public static let appGroup = "group.com.illuminatedrones.stillwater"
    private static let key = "stillwater_streak"
    private static let studyKey = "stillwater_study_streak"
    private static let learnKey = "stillwater_learn_streak"
    private static let weekKey = "stillwater_week"

    public static func loadStudy() -> StudyData {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.data(forKey: studyKey),
            let value = try? JSONDecoder().decode(StudyData.self, from: raw)
        else { return .empty }
        return value
    }

    public static func saveStudy(_ value: StudyData) {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = try? JSONEncoder().encode(value)
        else { return }
        defaults.set(raw, forKey: studyKey)
    }

    public static func loadLearn() -> LearnData {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.data(forKey: learnKey),
            let value = try? JSONDecoder().decode(LearnData.self, from: raw)
        else { return .empty }
        return value
    }

    public static func saveLearn(_ value: LearnData) {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = try? JSONEncoder().encode(value)
        else { return }
        defaults.set(raw, forKey: learnKey)
    }

    public static func loadWeek() -> WeekData {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.data(forKey: weekKey),
            let value = try? JSONDecoder().decode(WeekData.self, from: raw)
        else { return .empty }
        return value
    }

    public static func saveWeek(_ value: WeekData) {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = try? JSONEncoder().encode(value)
        else { return }
        defaults.set(raw, forKey: weekKey)
    }

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
    public static let deep    = (r: 0.008, g: 0.016, b: 0.027)  // #020407
    public static let mid     = (r: 0.016, g: 0.031, b: 0.051)  // #04080D
    public static let bright  = (r: 0.043, g: 0.078, b: 0.122)  // #0B141F
    public static let teal    = (r: 0.310, g: 0.765, b: 0.863)  // #4FC3DC
    public static let tealLt  = (r: 0.608, g: 0.929, b: 0.878)  // #9BEDE0
    public static let gold    = (r: 0.910, g: 0.722, b: 0.427)  // #E8B86D
    public static let ember   = (r: 0.949, g: 0.384, b: 0.165)  // #F2622A
    public static let violet  = (r: 0.733, g: 0.663, b: 0.969)  // #BBA9F7 (the Learn tab's violet)
    public static let pink    = (r: 0.961, g: 0.659, b: 0.753)  // #F5A8C0
}
