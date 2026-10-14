import Foundation

// Starting, ending, finishing and restarting a challenge, plus the record of one.
// Port of the rest of src/lib/logic/challenge.ts that Challenges.swift leaves out.
// Starting, ending, finishing or restarting one only writes challenge rows. No log is ever touched,
// so the history underneath stays as it was.

public struct ChallengeInput: Equatable {
    public var name: String
    public var startDate: DateStr
    public var lengthDays: Int
    /// Nil: the whole checklist.
    public var rules: [ChallengeRule]?
    public var moneyTarget: Double?
    public var moneyDeadline: DateStr?
    public var dailyFloor: Double

    public init(name: String, startDate: DateStr, lengthDays: Int, rules: [ChallengeRule]? = nil, moneyTarget: Double? = nil, moneyDeadline: DateStr? = nil, dailyFloor: Double = 0) {
        self.name = name
        self.startDate = startDate
        self.lengthDays = lengthDays
        self.rules = rules
        self.moneyTarget = moneyTarget
        self.moneyDeadline = moneyDeadline
        self.dailyFloor = dailyFloor
    }
}

/// The two columns a closing writes.
public struct ChallengeClosing: Equatable {
    public var status: ChallengeStatus
    public var endedOn: DateStr

    public var patch: JSONObject {
        return ["status": .string(status.rawValue), "ended_on": .string(endedOn)]
    }
}

public struct ChallengeRecord: Equatable {
    /// Days it covered so far.
    public var days: Int
    public var length: Int
    public var full: Int
    public var partial: Int
    public var missed: Int
}

public enum ChallengeRules {
    public static let maxChallengeDays = 365
    public static let defaultChallengeName = "Lock in"

    public static func statusLabel(_ s: ChallengeStatus) -> String {
        switch s {
        case .active: return "Active"
        case .succeeded: return "Finished"
        case .ended: return "Ended early"
        case .abandoned: return "Restarted"
        }
    }

    /// Days it actually covered, up to `today`.
    public static func daysRun(_ c: Challenge, _ today: DateStr) -> Int {
        let last = Challenges.lastDay(c)
        let to = last < today ? last : today
        return to < c.startDate ? 0 : LIDate.diffDays(c.startDate, to) + 1
    }

    /// Closed challenges, newest first.
    public static func pastChallenges(_ challenges: [Challenge]) -> [Challenge] {
        let closed = challenges.enumerated().filter { $0.element.status != .active }
        return closed.sorted { a, b in
            if a.element.startDate != b.element.startDate { return a.element.startDate > b.element.startDate }
            return a.offset < b.offset
        }.map { $0.element }
    }

    /// The items a challenge counts. Nil rules mean the whole checklist.
    public static func challengeItems(_ c: Challenge, _ items: [ChecklistItem]) -> [ChecklistItem] {
        guard let rules = c.rules else { return items }
        let ids = Set(rules.map { $0.itemId })
        return items.filter { ids.contains($0.id) }
    }

    /// Why an input cannot be saved, or nil when it can.
    public static func problem(_ input: ChallengeInput, today: DateStr) -> String? {
        if input.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Give it a name." }
        if !LIDate.isDateStr(input.startDate) { return "Pick a start date." }
        if input.startDate < today { return "It starts today or later." }
        if input.lengthDays < 1 { return "Length is at least 1 day." }
        if input.lengthDays > maxChallengeDays { return "Length is \(maxChallengeDays) days at most." }
        if let rules = input.rules, rules.isEmpty { return "Pick at least one item." }
        if let target = input.moneyTarget {
            if !(target > 0) { return "The money target is above zero." }
            guard let deadline = input.moneyDeadline, LIDate.isDateStr(deadline) else { return "Pick a deadline for the money target." }
            if deadline < input.startDate { return "The money deadline is on or after the start." }
        }
        return nil
    }

    /// The row for a new, active challenge.
    public static func newRow(_ input: ChallengeInput, restartOf: String? = nil) -> JSONObject {
        let hasTarget = (input.moneyTarget ?? 0) > 0
        let trimmed = input.name.trimmingCharacters(in: .whitespacesAndNewlines)
        var rules: JSON = .null
        if let rs = input.rules {
            rules = .array(rs.map { r in
                JSON.object(["item_id": .string(r.itemId), "target": r.target.map { JSON.from($0) } ?? .null])
            })
        }
        return [
            "name": .string(trimmed.isEmpty ? defaultChallengeName : trimmed),
            "status": .string("active"),
            "start_date": .string(input.startDate),
            "length_days": .number(Double(input.lengthDays)),
            "ended_on": .null,
            "rules": rules,
            "restart_of": JSON.str(restartOf),
            "money_target": hasTarget ? JSON.num(input.moneyTarget) : .null,
            "money_deadline": hasTarget ? JSON.str(input.moneyDeadline) : .null,
            "daily_floor": .number(input.dailyFloor),
            "money_target_start": .null,
        ]
    }

    /// Stop it early. It keeps the days it ran, today included. One that has not started yet never ran a day.
    public static func endPatch(_ c: Challenge, _ today: DateStr) -> ChallengeClosing {
        let end = Challenges.plannedEnd(c)
        let last: DateStr = today < c.startDate ? LIDate.addDays(c.startDate, -1) : (today > end ? end : today)
        return ChallengeClosing(status: .ended, endedOn: last)
    }

    /// Close one that ran its full length.
    public static func finishPatch(_ c: Challenge) -> ChallengeClosing {
        return ChallengeClosing(status: .succeeded, endedOn: Challenges.plannedEnd(c))
    }

    /// Whether a challenge can be marked finished: active and its last day is today or behind.
    public static func canFinish(_ c: Challenge, _ today: DateStr) -> Bool {
        return c.status == .active && today >= Challenges.plannedEnd(c)
    }

    /// Restart: the old run is closed the day before the new one starts and the same name, length and
    /// rules begin again on `today`. A money target moves forward by the same number of days.
    public static func restartRows(_ c: Challenge, _ today: DateStr) -> (close: ChallengeClosing?, next: JSONObject) {
        let shift = LIDate.diffDays(c.startDate, today)
        var deadline: DateStr? = nil
        if c.moneyTarget != nil, let d = c.moneyDeadline { deadline = LIDate.addDays(d, shift) }
        let next = newRow(
            ChallengeInput(name: c.name, startDate: today, lengthDays: c.lengthDays, rules: c.rules, moneyTarget: c.moneyTarget, moneyDeadline: deadline, dailyFloor: c.dailyFloor),
            restartOf: c.id
        )
        if c.status != .active { return (nil, next) }
        let before = LIDate.addDays(today, -1)
        let end = Challenges.plannedEnd(c)
        return (ChallengeClosing(status: .abandoned, endedOn: before > end ? end : before), next)
    }

    /// Day counts for a challenge from the status of each of its days. Today only counts once it is full.
    public static func record(_ c: Challenge, _ statusByDate: [DateStr: DayStatus], _ today: DateStr) -> ChallengeRecord {
        let last = Challenges.lastDay(c)
        let to = last < today ? last : today
        var full = 0
        var partial = 0
        var missed = 0
        var d = c.startDate
        while d <= to {
            let s = statusByDate[d] ?? .missed
            if s == .full {
                full += 1
            } else if d == today {
                // Today only counts once it is full.
            } else if s == .partial {
                partial += 1
            } else {
                missed += 1
            }
            d = LIDate.addDays(d, 1)
        }
        return ChallengeRecord(days: daysRun(c, today), length: c.lengthDays, full: full, partial: partial, missed: missed)
    }
}
