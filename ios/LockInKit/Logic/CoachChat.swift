import Foundation

// The coach as a chat: the check-ins it sends by itself, when notes are due, and the saved flag notes.
// Port of the pure parts of src/lib/logic/coachChat.ts and coach.ts. Wording by the model is done by the server routes.

public struct CoachCheckinDue: Equatable {
    public var trigger: CoachTrigger
    public var checkKey: String
    public var body: String
}

public struct CoachCheckinInput {
    public var today: DateStr
    public var time: TimeStr
    public var enabled: CoachCheckins
    public var voice: CoachVoice
    /// Today's blocks, clock times.
    public var blocks: [CoachBlock]
    /// Today's workout by name, when there is one.
    public var workoutName: String?
    /// True once today's workout item is ticked.
    public var workoutDone: Bool
    /// Slips logged today.
    public var slips: [CoachCheckinSlip]
    public var yesterday: YesterdayLine?
    /// check_key of every check-in already sent.
    public var sent: Set<String>

    public init(today: DateStr, time: TimeStr, enabled: CoachCheckins = CoachCheckins(), voice: CoachVoice = .stoic, blocks: [CoachBlock] = [], workoutName: String? = nil, workoutDone: Bool = false, slips: [CoachCheckinSlip] = [], yesterday: YesterdayLine? = nil, sent: Set<String> = []) {
        self.today = today
        self.time = time
        self.enabled = enabled
        self.voice = voice
        self.blocks = blocks
        self.workoutName = workoutName
        self.workoutDone = workoutDone
        self.slips = slips
        self.yesterday = yesterday
        self.sent = sent
    }
}

public struct CoachCheckinSlip: Equatable {
    public var id: String
    public var vice: String
    public var time: TimeStr
    public var trigger: String?
    public init(id: String, vice: String, time: TimeStr, trigger: String? = nil) {
        self.id = id
        self.vice = vice
        self.time = time
        self.trigger = trigger
    }
}

public struct ReviewDue: Equatable {
    /// The Sunday the review is dated.
    public var weekEnd: DateStr
    public var weekStart: DateStr
    /// Write it without being asked: the week is over, or it is Sunday evening.
    public var auto: Bool
}

/// What a coach_note of kind "flag" keeps in its body, as JSON.
public struct FlagEvidenceLine: Equatable {
    public var label: String
    public var value: String
}

public struct CoachFlag: Equatable {
    public var key: String
    public var kind: String
    public var title: String
    public var detail: String
    public var change: String
    public var evidence: [FlagEvidenceLine]
    public var since: DateStr
}

public struct FlagNote: Equatable {
    public var flag: CoachFlag
    public var dismissedOn: DateStr?
    public var resolvedOn: DateStr?
}

public enum CoachChat {
    /// Longest message the chat takes.
    public static let maxMessage = 600
    /// How many turns the server reads.
    public static let maxTurns = 16
    /// A line does not come back for this many days.
    public static let quoteRestDays = 7
    /// How long after the workout block ends the coach still asks about it.
    public static let workoutWindowMin = 180

    public static func voiceLabel(_ v: CoachVoice) -> String {
        switch v {
        case .stoic: return "Stoic"
        case .sergeant: return "Sergeant"
        case .brother: return "Brother"
        }
    }

    public static func voiceSub(_ v: CoachVoice) -> String {
        switch v {
        case .stoic: return "Calm and even. Few words."
        case .sergeant: return "Hard and blunt. Short orders."
        case .brother: return "Warm and straight, like a big brother."
        }
    }

    // MARK: check-ins

    static func ask(_ trigger: CoachTrigger, _ voice: CoachVoice) -> String {
        switch (trigger, voice) {
        case (.postWorkout, .stoic): return "How did it go?"
        case (.postWorkout, .sergeant): return "Report. How did it go?"
        case (.postWorkout, .brother): return "How did it go? What was the hardest part?"
        case (.slip, .stoic): return "What set it off?"
        case (.slip, .sergeant): return "What set it off? One line."
        case (.slip, .brother): return "What set it off? No judgment, I just want the pattern."
        case (.missedItem, .stoic): return "What got in the way?"
        case (.missedItem, .sergeant): return "What got in the way? Facts, not excuses."
        case (.missedItem, .brother): return "What got in the way?"
        case (.chat, _): return ""
        }
    }

    /// The check-ins that are due right now and have not been sent: one after today's workout block, one per slip
    /// logged today, one for yesterday's misses. Written by rule, so they arrive with no key and offline.
    public static func dueCheckins(_ input: CoachCheckinInput) -> [CoachCheckinDue] {
        var out: [CoachCheckinDue] = []
        let nowMin = LIDate.minutesOf(input.time)
        func add(_ c: CoachCheckinDue) {
            if !input.sent.contains(c.checkKey) {
                out.append(CoachCheckinDue(trigger: c.trigger, checkKey: c.checkKey, body: CoachText.cleanCoachText(c.body)))
            }
        }

        if input.enabled.missedItem, let y = input.yesterday, !y.misses.isEmpty {
            let names = y.misses.prefix(3).map { $0.name }
            let more = y.misses.count - names.count
            let ask = self.ask(.missedItem, input.voice)
            let body: String
            if y.done == 0 {
                body = "Nothing was ticked yesterday. One day, nothing resets. \(ask)"
            } else {
                let extra = more > 0 ? ", plus \(more) more" : ""
                body = "Yesterday closed at \(y.done) of \(y.total). Missed: \(names.joined(separator: ", "))\(extra). One day, nothing resets. \(ask)"
            }
            add(CoachCheckinDue(trigger: .missedItem, checkKey: "missed:\(y.date)", body: body))
        }

        if input.enabled.postWorkout {
            let block = input.blocks.filter { $0.kind == "workout" }.sorted { $0.end < $1.end }.first
            if let block = block {
                let since = nowMin - LIDate.minutesOf(block.end)
                if since >= 0 && since <= workoutWindowMin {
                    let name = input.workoutName ?? "The workout"
                    let body: String
                    if input.workoutDone {
                        body = "\(name) is ticked. \(ask(.postWorkout, input.voice))"
                    } else {
                        body = "The workout block ended at \(LIDate.formatTime(block.end)) and \(input.workoutName ?? "the workout") is not ticked. Did it happen?"
                    }
                    add(CoachCheckinDue(trigger: .postWorkout, checkKey: "post_workout:\(input.today)", body: body))
                }
            }
        }

        if input.enabled.slip {
            for s in input.slips {
                let head = "Logged: \(s.vice) at \(LIDate.formatTime(s.time))"
                let trigger = (s.trigger ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let body: String
                if !trigger.isEmpty {
                    var t = trigger
                    while let last = t.unicodeScalars.last, CharacterSet(charactersIn: ". \t\n\r").contains(last) {
                        t.unicodeScalars.removeLast()
                    }
                    body = "\(head), set off by \(t). One slip is one day, nothing resets. What do you do the next time that comes up?"
                } else {
                    body = "\(head). One slip is one day, nothing resets. \(ask(.slip, input.voice))"
                }
                add(CoachCheckinDue(trigger: .slip, checkKey: "slip:\(s.id)", body: body))
            }
        }
        return out
    }

    /// Quote keys used by coach messages sent on or after `since`.
    public static func quotesUsedSince(_ messages: [CoachMessage], since: DateStr) -> [String] {
        var out: [String] = []
        for m in messages where m.sender == .coach && m.date >= since {
            if let q = m.quote, !q.isEmpty, !out.contains(q) { out.append(q) }
        }
        return out
    }

    // MARK: notes

    /// What a morning brief depends on beyond the day's logs: the challenge, its money target and the floor.
    public static func briefBasis(_ c: Challenge?, floor: Double) -> String {
        func n(_ d: Double) -> String {
            return d == d.rounded() ? String(Int(d)) : String(d)
        }
        guard let c = c else { return "none|\(n(floor))" }
        let parts: [String] = [
            c.id,
            c.startDate,
            String(c.lengthDays),
            c.moneyTarget.map { n($0) } ?? "",
            c.moneyDeadline ?? "",
            c.moneyTargetStart ?? "",
            n(floor),
        ]
        return parts.joined(separator: "|")
    }

    /// True when a saved brief was written from something that has since changed. A brief with no basis is left alone.
    public static func briefIsStale(_ note: CoachNote?, basis: String) -> Bool {
        guard let note = note, let b = note.basis else { return false }
        return b != basis
    }

    /// Which week's review is current. On Sunday it is this week; Monday to Saturday it is the week that just ended.
    /// Nil when that week is before the history starts.
    public static func reviewDue(today: DateStr, time: TimeStr, historyStart: DateStr) -> ReviewDue? {
        let isSunday = LIDate.weekdayOf(today) == 0
        let sunday = isSunday ? today : LIDate.addDays(LIDate.weekStart(today), -1)
        let monday = LIDate.weekStart(sunday)
        if sunday < historyStart { return nil }
        return ReviewDue(weekEnd: sunday, weekStart: monday, auto: !isSunday || time >= "20:00")
    }

    /// The next Sunday a review will land, for the empty state.
    public static func nextReviewDate(_ today: DateStr) -> DateStr {
        return LIDate.weekEnd(today)
    }

    // MARK: flag notes

    /// Read a saved flag note. Nil when the body is not one.
    public static func parseFlagNote(_ body: String) -> FlagNote? {
        guard let data = body.data(using: .utf8), let json = try? JSONDecoder().decode(JSON.self, from: data) else { return nil }
        guard case .object(let o) = json, case .object(let f)? = o["flag"] else { return nil }
        guard let key = f["key"]?.stringValue, let title = f["title"]?.stringValue else { return nil }
        var evidence: [FlagEvidenceLine] = []
        if case .array(let rows)? = f["evidence"] {
            for r in rows {
                if case .object(let e) = r {
                    evidence.append(FlagEvidenceLine(label: e["label"]?.stringValue ?? "", value: e["value"]?.stringValue ?? ""))
                }
            }
        }
        let flag = CoachFlag(
            key: key,
            kind: f["kind"]?.stringValue ?? "",
            title: title,
            detail: f["detail"]?.stringValue ?? "",
            change: f["change"]?.stringValue ?? "",
            evidence: evidence,
            since: f["since"]?.stringValue ?? ""
        )
        let dismissed = o["dismissed_on"]?.stringValue
        let resolved = o["resolved_on"]?.stringValue
        return FlagNote(flag: flag, dismissedOn: (dismissed ?? "").isEmpty ? nil : dismissed, resolvedOn: (resolved ?? "").isEmpty ? nil : resolved)
    }

    /// The same body with the dismissal set or cleared. Nil when the body is not a flag note.
    public static func flagBody(_ body: String, dismissedOn: DateStr?) -> String? {
        guard let data = body.data(using: .utf8), let json = try? JSONDecoder().decode(JSON.self, from: data) else { return nil }
        guard case .object(var o) = json, o["flag"] != nil else { return nil }
        o["dismissed_on"] = JSON.str(dismissedOn)
        guard let out = try? JSONEncoder().encode(JSON.object(o)) else { return nil }
        return String(data: out, encoding: .utf8)
    }

    /// Flag notes that should show as cards: detected, not dismissed, not resolved.
    public static func activeFlagNotes(_ notes: [CoachNote]) -> [(note: CoachNote, flag: FlagNote)] {
        var out: [(note: CoachNote, flag: FlagNote)] = []
        for n in notes where n.kind == .flag {
            if let f = parseFlagNote(n.body), f.resolvedOn == nil, f.dismissedOn == nil { out.append((note: n, flag: f)) }
        }
        return out
    }
}
