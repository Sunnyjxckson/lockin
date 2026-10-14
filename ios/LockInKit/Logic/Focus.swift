import Foundation

// Port of src/lib/logic/focus.ts. The rules for the study and focus timer.
//
// A running timer is a focus_session row with `end` null. Everything about the clock is worked out
// from instants (epoch milliseconds), never from a counter that ticks, so a relaunch, a closed app
// or a sleeping phone changes nothing.
//
// Three kinds of time: clock time (start to now), active time (clock minus pauses) and focused time
// (active minus time away that the user did not claim back). Focused time is what gets logged.

public struct FocusLiveTimer: Equatable, Codable {
    /// The focus_session row id.
    public var id: String
    public var startedAt: Double
    public var label: String
    /// Countdown length in seconds, or nil to count up.
    public var plannedSeconds: Double?
    public var blockId: String?
    public var pauses: [FocusSpan]
    public var aways: [FocusAway]
    /// When this state last changed. Between a device's copy and the row's, the newer one wins.
    public var rev: Double?

    public init(id: String, startedAt: Double, label: String, plannedSeconds: Double? = nil, blockId: String? = nil, pauses: [FocusSpan] = [], aways: [FocusAway] = [], rev: Double? = nil) {
        self.id = id
        self.startedAt = startedAt
        self.label = label
        self.plannedSeconds = plannedSeconds
        self.blockId = blockId
        self.pauses = pauses
        self.aways = aways
        self.rev = rev
    }
}

public struct FocusClock: Equatable {
    public var clockSeconds: Int
    public var pausedSeconds: Int
    public var activeSeconds: Int
    public var awayCount: Int
    /// All time away, claimed back or not.
    public var awaySeconds: Int
    public var focusedSeconds: Int
    public var paused: Bool
    /// Seconds left on a countdown, nil when counting up. Never below 0.
    public var remaining: Int?
    /// Seconds past the end of a countdown.
    public var overBy: Int
    /// 0 to 1 through a countdown, 0 when counting up.
    public var progress: Double
}

public struct FocusStale: Equatable {
    public enum Reason: String { case away, long }
    public var reason: Reason
    public var clockMinutes: Int
    /// The instant the session most likely really ended (epoch ms).
    public var endedAt: Double
    public var suggestedMinutes: Int
}

public enum FocusStrictMode: String, Equatable, CaseIterable {
    case off, end, void
}

public struct FocusStrictResult: Equatable {
    public var action: FocusStrictMode
    public var at: Double
    public var awaySeconds: Int
}

/// What a finished session keeps beyond its length: the columns added in migration 0009.
public struct FocusSessionMeta: Equatable {
    public var clockMinutes: Int
    public var awayCount: Int
    public var awayMinutes: Int
    public var plannedMinutes: Int?
    /// A countdown that reached its length.
    public var completed: Bool
}

public struct FocusFinished: Equatable {
    /// False when it is too short to log.
    public var log: Bool
    /// Wall time it stopped, "HH:MM".
    public var end: String
    /// Focused minutes.
    public var minutes: Int
    public var meta: FocusSessionMeta

    /// The row patch. The running state is cleared. Pass a length the user typed in to override, which also drops `completed`.
    public func patch(minutes override: Int? = nil) -> JSONObject {
        let m = override ?? minutes
        let completed = override != nil ? false : meta.completed
        return [
            "end": .string(end),
            "minutes": JSON.int(m),
            "live": .null,
            "clock_minutes": JSON.int(meta.clockMinutes),
            "away_count": JSON.int(meta.awayCount),
            "away_minutes": JSON.int(meta.awayMinutes),
            "planned_minutes": meta.plannedMinutes.map { JSON.int($0) } ?? .null,
            "completed": .bool(completed),
        ]
    }
}

public struct FocusWeekDay: Equatable {
    public var date: DateStr
    public var letter: String
    public var minutes: Int
    public var met: Bool
    public var future: Bool
    public var today: Bool
}

public enum FocusTickDecision: Equatable {
    case tick, untick, none
}

public enum Focus {
    // MARK: constants

    /// Leaving for less than this is not counted as leaving.
    public static let minAwaySeconds = 5
    /// Gone this long with the timer running and nobody is studying any more: ask what happened.
    public static let staleAwaySeconds = 2 * 60 * 60
    /// No single session is believed past this without asking.
    public static let maxSessionSeconds = 6 * 60 * 60
    /// A session shorter than this is not logged.
    public static let minLogSeconds = 60
    /// A countdown counts as completed this close to its length.
    public static let completeSlackSeconds = 60
    public static let presetMinutes = [25, 45, 60, 90]
    public static let labels = ["Study", "Homework", "Business"]
    public static let graceOptions = [30, 60, 180]
    public static let maxManualMinutes = 16 * 60

    // MARK: the running timer

    public static func newLive(id: String, startedAt: Double, label: String, plannedSeconds: Double? = nil, blockId: String? = nil) -> FocusLiveTimer {
        return FocusLiveTimer(id: id, startedAt: startedAt, label: label, plannedSeconds: plannedSeconds, blockId: blockId)
    }

    public static func revOf(_ live: FocusLiveTimer) -> Double {
        return live.rev ?? live.startedAt
    }

    /// What the row keeps of a running timer, so another device shows the same clock.
    /// Open spans keep an explicit null for `to`, because the web reads undefined as a broken span.
    public static func stateJSON(_ live: FocusLiveTimer) -> JSON {
        func span(_ from: Double, _ to: Double?) -> [String: JSON] {
            return ["from": .number(from), "to": JSON.num(to)]
        }
        let pauses: [JSON] = live.pauses.map { JSON.object(span($0.from, $0.to)) }
        let aways: [JSON] = live.aways.map { a in
            var o = span(a.from, a.to)
            o["counted"] = .bool(a.counted)
            o["reviewed"] = .bool(a.reviewed)
            return JSON.object(o)
        }
        return .object([
            "started_at": .number(live.startedAt),
            "planned_seconds": JSON.num(live.plannedSeconds),
            "pauses": .array(pauses),
            "aways": .array(aways),
            "rev": .number(revOf(live)),
        ])
    }

    /// The timer rebuilt from its row: the saved pauses and time away when the row has them, otherwise a plain clock from created_at.
    public static func liveFromRow(_ row: FocusSession) -> FocusLiveTimer {
        let at = LIDate.parseISO(row.createdAt).map { $0.timeIntervalSince1970 * 1000.0 }
        let label = (row.label ?? "").isEmpty ? "Study" : (row.label ?? "Study")
        let base = FocusLiveTimer(id: row.id, startedAt: at ?? Date().timeIntervalSince1970 * 1000.0, label: label, plannedSeconds: nil, blockId: row.blockId)
        guard let state = row.live, state.startedAt > 0 else { return base }
        var out = base
        out.startedAt = state.startedAt
        out.plannedSeconds = state.plannedSeconds
        out.pauses = state.pauses
        out.aways = state.aways
        out.rev = state.rev > 0 ? state.rev : state.startedAt
        return out
    }

    public enum LiveSource: Equatable { case device, row }

    /// Which copy of a running timer to believe: the one saved on this device or the one on the row. The newer wins, a tie goes to the device.
    public static func pickLive(saved: FocusLiveTimer?, row: FocusSession) -> (live: FocusLiveTimer, from: LiveSource) {
        let fromRow = liveFromRow(row)
        if let s = saved, s.id == row.id, revOf(s) >= (row.live?.rev ?? 0) { return (s, .device) }
        return (fromRow, .row)
    }

    static func lengthOf(_ from: Double, _ to: Double?, _ now: Double) -> Double {
        return max(0, min(to ?? now, now) - from)
    }

    public static func isPaused(_ live: FocusLiveTimer) -> Bool {
        return live.pauses.contains { $0.to == nil }
    }

    public static func openAway(_ live: FocusLiveTimer) -> FocusAway? {
        return live.aways.first { $0.to == nil }
    }

    /// Pause at `now`. Pass the instant the clock on screen was drawn for, so the number the user paused on is the number that stays.
    /// A pause never starts before the last one ended.
    public static func pause(_ live: FocusLiveTimer, now: Double) -> FocusLiveTimer {
        if isPaused(live) { return live }
        let floor = live.pauses.reduce(live.startedAt) { max($0, $1.to ?? 0) }
        var out = live
        out.pauses.append(FocusSpan(from: max(now, floor), to: nil))
        return out
    }

    public static func resume(_ live: FocusLiveTimer, now: Double) -> FocusLiveTimer {
        var out = live
        out.pauses = live.pauses.map { p in
            if p.to == nil { return FocusSpan(from: p.from, to: max(p.from, now)) }
            return p
        }
        return out
    }

    /// The app went to the background. Nothing is recorded while paused.
    public static func leave(_ live: FocusLiveTimer, now: Double) -> FocusLiveTimer {
        if isPaused(live) || openAway(live) != nil { return live }
        var out = live
        out.aways.append(FocusAway(from: now, to: nil, counted: false, reviewed: false))
        return out
    }

    /// The app came back. Blips shorter than minAwaySeconds are dropped.
    public static func comeBack(_ live: FocusLiveTimer, now: Double) -> FocusLiveTimer {
        guard let i = live.aways.firstIndex(where: { $0.to == nil }) else { return live }
        var out = live
        if now - live.aways[i].from < Double(minAwaySeconds) * 1000.0 {
            out.aways.remove(at: i)
        } else {
            out.aways[i].to = now
        }
        return out
    }

    /// The away the user has not answered for yet (the most recent one).
    public static func pendingAway(_ live: FocusLiveTimer) -> FocusAway? {
        for a in live.aways.reversed() where a.to != nil && !a.reviewed {
            return a
        }
        return nil
    }

    /// Answer every closed, unanswered away: keep the time or take it off.
    public static func reviewAways(_ live: FocusLiveTimer, counted: Bool) -> FocusLiveTimer {
        var out = live
        out.aways = live.aways.map { a in
            if a.to != nil && !a.reviewed { return FocusAway(from: a.from, to: a.to, counted: counted, reviewed: true) }
            return a
        }
        return out
    }

    public static func clockOf(_ live: FocusLiveTimer, now: Double) -> FocusClock {
        let at = max(now, live.startedAt)
        let clock = at - live.startedAt
        let paused = live.pauses.reduce(0.0) { $0 + lengthOf($1.from, $1.to, at) }
        let away = live.aways.reduce(0.0) { $0 + lengthOf($1.from, $1.to, at) }
        let lost = live.aways.reduce(0.0) { $0 + ($1.counted ? 0 : lengthOf($1.from, $1.to, at)) }
        let active = max(0, clock - paused)
        let focused = Int(floor(max(0, active - lost) / 1000.0))
        let planned = live.plannedSeconds
        var remaining: Int? = nil
        var over = 0
        var progress = 0.0
        if let p = planned {
            let pi = Int(p)
            remaining = max(0, pi - focused)
            over = max(0, focused - pi)
            progress = p <= 0 ? 0 : min(1, Double(focused) / p)
        }
        return FocusClock(
            clockSeconds: Int(floor(clock / 1000.0)),
            pausedSeconds: Int(floor(paused / 1000.0)),
            activeSeconds: Int(floor(active / 1000.0)),
            awayCount: live.aways.count,
            awaySeconds: Int(floor(away / 1000.0)),
            focusedSeconds: focused,
            paused: isPaused(live),
            remaining: remaining,
            overBy: over,
            progress: progress
        )
    }

    // MARK: left running

    /// A timer left running: the app has been in the background for hours, or the session is longer than anyone works in one sitting.
    /// Either way it is capped and the user is asked, it is never logged as is.
    public static func staleInfo(_ live: FocusLiveTimer, now: Double) -> FocusStale? {
        let staleMs = Double(staleAwaySeconds) * 1000.0
        let open = openAway(live)
        let longAway = live.aways.first { !$0.reviewed && lengthOf($0.from, $0.to, now) >= staleMs }
        var gone: FocusAway? = longAway
        if gone == nil, let o = open, lengthOf(o.from, o.to, now) >= staleMs { gone = o }
        let c = clockOf(live, now: now)
        let cap = min(maxSessionSeconds, live.plannedSeconds.map { Int($0) } ?? maxSessionSeconds)
        if let g = gone {
            let before = clockOf(live, now: g.from).focusedSeconds
            return FocusStale(reason: .away, clockMinutes: c.clockSeconds / 60, endedAt: g.from, suggestedMinutes: Int((Double(min(before, cap)) / 60.0).rounded()))
        }
        if c.activeSeconds > maxSessionSeconds {
            return FocusStale(reason: .long, clockMinutes: c.clockSeconds / 60, endedAt: now, suggestedMinutes: Int((Double(cap) / 60.0).rounded()))
        }
        return nil
    }

    // MARK: strict mode

    /// In strict mode, an away longer than the grace period ends or voids the session.
    public static func strictBreach(_ live: FocusLiveTimer, mode: FocusStrictMode, graceSeconds: Int, now: Double) -> FocusStrictResult? {
        if mode == .off { return nil }
        for a in live.aways where !a.reviewed {
            let len = lengthOf(a.from, a.to, now)
            if len > Double(graceSeconds) * 1000.0 {
                return FocusStrictResult(action: mode, at: a.from, awaySeconds: Int(floor(len / 1000.0)))
            }
        }
        return nil
    }

    // MARK: finishing

    /// Close a timer at `at`. The session keeps the date it started on, so one that runs past midnight counts toward the day it began.
    public static func finish(_ live: FocusLiveTimer, at: Double) -> FocusFinished {
        let closed = comeBack(resume(live, now: at), now: at)
        let c = clockOf(closed, now: at)
        let planned = closed.plannedSeconds
        let meta = FocusSessionMeta(
            clockMinutes: Int((Double(c.clockSeconds) / 60.0).rounded()),
            awayCount: c.awayCount,
            awayMinutes: Int((Double(c.awaySeconds) / 60.0).rounded()),
            plannedMinutes: planned.map { Int(($0 / 60.0).rounded()) },
            completed: planned != nil && Double(c.focusedSeconds) >= (planned ?? 0) - Double(completeSlackSeconds)
        )
        return FocusFinished(
            log: c.focusedSeconds >= minLogSeconds,
            end: LIDate.nyParts(Date(timeIntervalSince1970: at / 1000.0)).time,
            minutes: Int((Double(c.focusedSeconds) / 60.0).rounded()),
            meta: meta
        )
    }

    static func noMeta() -> JSONObject {
        return [
            "away_count": .int(0),
            "away_minutes": .int(0),
            "clock_minutes": .null,
            "planned_minutes": .null,
            "completed": .bool(false),
            "live": .null,
        ]
    }

    /// The row for a timer that starts at `now`. created_at carries the exact instant.
    public static func startRow(now: Double, label: String, blockId: String?, live: FocusLiveTimer? = nil) -> JSONObject {
        let date = Date(timeIntervalSince1970: now / 1000.0)
        let p = LIDate.nyParts(date)
        var row = noMeta()
        row["date"] = .string(p.date)
        row["start"] = .string(p.time)
        row["end"] = .null
        row["minutes"] = .int(0)
        row["label"] = .string(label)
        row["source"] = .string("timer")
        row["block_id"] = JSON.str(blockId)
        if let l = live {
            if let planned = l.plannedSeconds, planned > 0 { row["planned_minutes"] = .int(Int((planned / 60.0).rounded())) }
            row["live"] = stateJSON(l)
        }
        row["created_at"] = .string(LIDate.nowIso(date))
        return row
    }

    // MARK: logging by hand, editing

    public static func cleanLabel(_ label: String?) -> String {
        var swapped = ""
        for u in (label ?? "").unicodeScalars {
            if u.value >= 0x2012 && u.value <= 0x2015 {
                swapped += ", "
            } else {
                swapped.unicodeScalars.append(u)
            }
        }
        let words = swapped.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        let joined = String(words.joined(separator: " ").prefix(40)).trimmingCharacters(in: .whitespaces)
        return joined.isEmpty ? "Study" : joined
    }

    public static func manualProblem(date: DateStr, minutes: Int?, today: DateStr) -> String? {
        if date > today { return "That day has not happened yet." }
        guard let m = minutes, m >= 1 else { return "Enter how many minutes." }
        if m > maxManualMinutes { return "That is more than 16 hours. Split it up." }
        return nil
    }

    static func wrapTime(_ start: TimeStr, _ minutes: Int) -> TimeStr {
        return LIDate.timeFromMinutes(LIDate.minutesOf(start) + minutes)
    }

    /// A row logged by hand. End wraps past midnight, the date stays.
    public static func manualRow(date: DateStr, minutes: Int, label: String, start: TimeStr) -> JSONObject {
        var row = noMeta()
        row["date"] = .string(date)
        row["start"] = .string(start)
        row["end"] = .string(wrapTime(start, minutes))
        row["minutes"] = .int(minutes)
        row["label"] = .string(cleanLabel(label))
        row["source"] = .string("manual")
        row["block_id"] = .null
        return row
    }

    /// The patch for editing a finished session. End follows the new length.
    public static func editPatch(start: TimeStr, date: DateStr, minutes: Int, label: String) -> JSONObject {
        return [
            "date": .string(date),
            "minutes": .int(minutes),
            "label": .string(cleanLabel(label)),
            "end": .string(wrapTime(start, minutes)),
        ]
    }

    // MARK: totals

    /// Minutes logged on a date. Running timers (end nil) hold 0 and add nothing.
    public static func minutesOn(_ sessions: [FocusSession], _ date: DateStr) -> Int {
        return sessions.reduce(0) { n, s in
            n + (s.date == date && s.end != nil ? max(0, s.minutes) : 0)
        }
    }

    static let letters = ["M", "T", "W", "T", "F", "S", "S"]

    /// Monday to Sunday of the week holding `today`. `live` is the running timer, added to its own date.
    public static func weekByDay(_ sessions: [FocusSession], today: DateStr, goal: Int, live: (date: DateStr, minutes: Int)? = nil) -> [FocusWeekDay] {
        let dates = LIDate.weekDates(today)
        var out: [FocusWeekDay] = []
        for i in 0..<dates.count {
            let date = dates[i]
            var minutes = minutesOn(sessions, date)
            if let l = live, l.date == date { minutes += l.minutes }
            out.append(FocusWeekDay(date: date, letter: letters[i % 7], minutes: minutes, met: goal > 0 && minutes >= goal, future: date > today, today: date == today))
        }
        return out
    }

    public static func goalProgress(minutes: Int, goal: Int) -> Double {
        if goal > 0 { return min(1, Double(minutes) / Double(goal)) }
        return minutes > 0 ? 1 : 0
    }

    // MARK: the study item on the checklist

    /// Whether to touch the "Study or homework block" item for a date.
    /// Tick when the day's minutes reach the goal or a scheduled block's timer was completed.
    /// Untick only a tick this feature made itself, and only when the reason for it is gone.
    public static func studyTick(minutes: Int, goal: Int, blockCompleted: Bool, checked: Bool, autoTicked: Bool) -> FocusTickDecision {
        let earned = (goal > 0 && minutes >= goal) || blockCompleted
        if earned { return checked ? .none : .tick }
        if checked && autoTicked { return .untick }
        return .none
    }

    // MARK: a study block that is live on the schedule

    /// The study block running right now, with the seconds left in it.
    public static func liveStudyBlock(_ blocks: [DayBlock], nowSeconds: Int) -> (block: DayBlock, remainingSeconds: Int)? {
        for b in blocks where b.kind == .study {
            let s = LIDate.minutesOf(b.start) * 60
            var e = LIDate.minutesOf(b.end) * 60
            if e <= s { e = 24 * 3600 }
            if nowSeconds >= s && nowSeconds < e && e - nowSeconds >= minLogSeconds {
                return (b, e - nowSeconds)
            }
        }
        return nil
    }

    // MARK: formatting

    /// "4m 10s", "45s", "1h 5m". For time away.
    public static func formatAway(_ seconds: Int) -> String {
        let t = max(0, seconds)
        if t < 60 { return "\(t)s" }
        let h = t / 3600
        let m = (t % 3600) / 60
        if h > 0 { return m > 0 ? "\(h)h \(m)m" : "\(h)h" }
        let s = t % 60
        return s > 0 ? "\(m)m \(s)s" : "\(m)m"
    }

    /// "1:05:09" or "12:34".
    public static func formatCountdown(_ seconds: Int) -> String {
        let t = max(0, seconds)
        let h = t / 3600
        let m = (t % 3600) / 60
        let s = t % 60
        func pad(_ n: Int) -> String { return n < 10 ? "0\(n)" : String(n) }
        return h > 0 ? "\(h):\(pad(m)):\(pad(s))" : "\(m):\(pad(s))"
    }

    public static func nowMs() -> Double {
        return Date().timeIntervalSince1970 * 1000.0
    }
}
