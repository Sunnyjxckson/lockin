import Foundation

public enum ChallengePhase: String, Equatable {
    case upcoming, running, finished, closed
}

/// "challenge" only while one is running today. Everything else is ongoing.
public enum AppMode: String, Equatable {
    case challenge, ongoing
}

public struct ModeInfo {
    public var mode: AppMode
    /// The challenge running today. Nil in ongoing mode.
    public var challenge: Challenge?
    /// Its day number today, starting at 1. Nil in ongoing mode.
    public var day: Int?
    public var length: Int?
    /// Its last planned day. Nil in ongoing mode.
    public var lastDay: DateStr?
    /// The active challenge when its last day has passed and it still needs closing.
    public var finished: Challenge?
    /// The active challenge when it has not started yet.
    public var upcoming: Challenge?
    /// First date of the ongoing history.
    public var historyStart: DateStr
}

public struct Consistency: Equatable {
    /// Full days in the window.
    public var full: Int
    /// Days with some but not all items done.
    public var partial: Int
    /// Days the window covers. Fewer than `window` early in the history.
    public var days: Int
    public var window: Int
    /// 0 to 100.
    public var percent: Int
}

/// Ongoing mode and challenges. Port of the parts of src/lib/logic/challenge.ts the phone needs.
public enum Challenges {
    // MARK: dates

    /// The last day of the plan: start plus length.
    public static func plannedEnd(_ c: Challenge) -> DateStr {
        return LIDate.addDays(c.startDate, max(1, c.lengthDays) - 1)
    }

    /// The last day it ran, or will run.
    public static func lastDay(_ c: Challenge) -> DateStr {
        if c.status == .active || c.endedOn == nil { return plannedEnd(c) }
        let end = plannedEnd(c)
        let ended = c.endedOn ?? end
        return ended > end ? end : ended
    }

    public static func ranOn(_ c: Challenge, _ date: DateStr) -> Bool {
        return date >= c.startDate && date <= lastDay(c)
    }

    public static func challengePhase(_ c: Challenge, _ today: DateStr) -> ChallengePhase {
        if c.status != .active { return .closed }
        if today < c.startDate { return .upcoming }
        return today > plannedEnd(c) ? .finished : .running
    }

    public static func activeChallenge(_ challenges: [Challenge]) -> Challenge? {
        return challenges.first { $0.status == .active }
    }

    public static func modeOn(_ challenges: [Challenge], historyStart: DateStr, today: DateStr) -> ModeInfo {
        let active = activeChallenge(challenges)
        let phase: ChallengePhase = active.map { challengePhase($0, today) } ?? .closed
        let running: Challenge? = phase == .running ? active : nil
        return ModeInfo(
            mode: running != nil ? .challenge : .ongoing,
            challenge: running,
            day: running.map { LIDate.dayNumber($0.startDate, today) },
            length: running?.lengthDays,
            lastDay: running.map { plannedEnd($0) },
            finished: phase == .finished ? active : nil,
            upcoming: phase == .upcoming ? active : nil,
            historyStart: historyStart <= today ? historyStart : today
        )
    }

    // MARK: rules

    /// The target a challenge sets for an item, or nil when it leaves the item's own target alone.
    public static func ruleTarget(_ c: Challenge, itemId: String) -> Target? {
        guard let rules = c.rules else { return nil }
        return rules.first(where: { $0.itemId == itemId })?.target
    }

    /// The daily earnings floor in force. A running challenge that holds "Earned today" to its own minimum sets the floor while it runs.
    public static func floorOn(base: Double, challenge: Challenge?, earnedItemId: String?) -> Double {
        guard let challenge = challenge, let earnedItemId = earnedItemId else { return base }
        guard let t = ruleTarget(challenge, itemId: earnedItemId) else { return base }
        var minimum: Double? = nil
        switch t {
        case .min(let v): minimum = v
        case .range(let lo, _): minimum = lo
        default: minimum = nil
        }
        if let m = minimum, m > 0 { return m }
        return base
    }

    /// A day scored for the challenge: the same day, counting only the challenge's items.
    public static func challengeDay(_ c: Challenge, _ summary: DaySummary) -> DaySummary {
        guard let rules = c.rules else { return summary }
        let ids = Set(rules.map { $0.itemId })
        let items = summary.items.filter { ids.contains($0.item.id) }
        let done = items.filter { $0.done }.count
        var out = summary
        out.items = items
        out.done = done
        out.total = items.count
        out.status = Scoring.statusFromCounts(done: done, total: items.count)
        out.percent = Scoring.percent(done, items.count)
        return out
    }

    /// The target history to score with: the saved versions, with every challenge's rule targets laid over the days that challenge ran.
    public static func scoringVersions(_ versions: [TargetVersion], _ challenges: [Challenge]) -> [TargetVersion] {
        var out = versions
        let withTargets = challenges.filter { c in
            guard let rules = c.rules else { return false }
            return rules.contains { $0.target != nil }
        }
        let ordered = withTargets.sorted { a, b in
            if a.startDate == b.startDate { return a.createdAt < b.createdAt }
            return a.startDate < b.startDate
        }
        for c in ordered {
            let from = c.startDate
            let to = lastDay(c)
            if to < from { continue }
            let after = LIDate.addDays(to, 1)
            for rule in c.rules ?? [] {
                guard let target = rule.target else { continue }
                let atStart = Targets.versionOn(out, itemId: rule.itemId, date: from)
                let atAfter = Targets.versionOn(out, itemId: rule.itemId, date: after)
                var next: [TargetVersion] = []
                var hasStart = false
                var hasAfter = false
                for v in out {
                    if v.itemId != rule.itemId || v.effectiveFrom < from || v.effectiveFrom > after {
                        next.append(v)
                    } else if v.effectiveFrom == after {
                        hasAfter = true
                        next.append(v)
                    } else {
                        if v.effectiveFrom == from { hasStart = true }
                        var changed = v
                        changed.target = target
                        next.append(changed)
                    }
                }
                if !hasStart, var s = atStart {
                    s.id = "challenge:\(c.id):\(rule.itemId):start"
                    s.effectiveFrom = from
                    s.target = target
                    next.append(s)
                }
                if !hasAfter, var a = atAfter {
                    a.id = "challenge:\(c.id):\(rule.itemId):after"
                    a.effectiveFrom = after
                    next.append(a)
                }
                out = next
            }
        }
        return out.sorted { $0.effectiveFrom < $1.effectiveFrom }
    }

    // MARK: consistency

    /// How many of the last `window` days were full. One slip costs one day out of the window.
    /// Today counts once it is full. Until then the window ends yesterday.
    public static func consistency(_ statusByDate: [DateStr: DayStatus], today: DateStr, from: DateStr, window: Int = 30) -> Consistency {
        let size = max(1, window)
        let end = statusByDate[today] == .full ? today : LIDate.addDays(today, -1)
        let first = LIDate.addDays(end, -(size - 1))
        let start = first < from ? from : first
        var full = 0
        var partial = 0
        var days = 0
        var d = start
        while d <= end {
            days += 1
            if statusByDate[d] == .full {
                full += 1
            } else if statusByDate[d] == .partial {
                partial += 1
            }
            d = LIDate.addDays(d, 1)
        }
        let pct = days == 0 ? 0 : Int((Double(full) / Double(days) * 100.0).rounded(.toNearestOrAwayFromZero))
        return Consistency(full: full, partial: partial, days: days, window: size, percent: pct)
    }

    /// "26 of the last 30 days", "3 of 4 days" early on, "First day" before anything is behind you.
    public static func consistencyLabel(_ c: Consistency) -> String {
        if c.days == 0 { return "First day" }
        if c.days < c.window { return "\(c.full) of \(c.days) \(c.days == 1 ? "day" : "days")" }
        return "\(c.full) of the last \(c.window) days"
    }

    /// The status of every day in the history so far (ongoing scoring).
    public static func statusByDate(historyStart: DateStr, today: DateStr, items: [ChecklistItem], versions: [TargetVersion], logs: [DayLog]) -> [DateStr: DayStatus] {
        var out: [DateStr: DayStatus] = [:]
        if historyStart > today { return out }
        // Index logs by date once so a long history stays cheap.
        var byDate: [DateStr: [DayLog]] = [:]
        for l in logs { byDate[l.date, default: []].append(l) }
        for d in LIDate.dateRange(historyStart, today) {
            out[d] = Scoring.summarizeDay(d, items, versions, byDate[d] ?? []).status
        }
        return out
    }
}
