import Foundation

// Port of the planning half of src/lib/logic/reminders.ts. planDay turns the stored reminders plus one
// day's blocks into the list of notifications that day could send. The phone schedules them as local
// notifications, so a reminder means the same thing here as on the server.
// Philosophy drops (drops.ts) are not part of this port.

/// The part of a schedule block the rules need.
public struct ReminderBlock: Equatable {
    public var id: String
    public var blockName: String
    public var start: TimeStr
    public var templateId: String?

    public init(id: String, blockName: String, start: TimeStr, templateId: String? = nil) {
        self.id = id
        self.blockName = blockName
        self.start = start
        self.templateId = templateId
    }

    public init(_ b: DayBlock) {
        self.init(id: b.id, blockName: b.blockName, start: b.start, templateId: b.templateId)
    }
}

/// Everything about one calendar day that decides what is sent.
public struct ReminderDay: Equatable {
    public var date: DateStr
    public var blocks: [ReminderBlock]
    /// Total earned on this date so far.
    public var earned: Double
    /// True when the day's main workout is a rest day, so the workout reminder is skipped.
    public var restDay: Bool

    public init(date: DateStr, blocks: [ReminderBlock], earned: Double = 0, restDay: Bool = false) {
        self.date = date
        self.blocks = blocks
        self.earned = earned
        self.restDay = restDay
    }
}

public struct PlannedNotification: Equatable {
    /// Unique per send.
    public var key: String
    public var reminderId: String
    public var kind: ReminderKind
    public var date: DateStr
    public var time: TimeStr
    /// The instant it fires.
    public var at: Date
    public var title: String
    public var body: String
    public var url: String
}

public struct ReminderPlanOptions: Equatable {
    public var floor: Double
    public var quietStart: TimeStr
    public var quietEnd: TimeStr

    public init(floor: Double, quietStart: TimeStr, quietEnd: TimeStr) {
        self.floor = floor
        self.quietStart = quietStart
        self.quietEnd = quietEnd
    }
}

public enum Reminders {
    /// Where a tap on the notification lands.
    public static func urlFor(_ kind: ReminderKind) -> String {
        switch kind {
        case .delivery, .earningsNudge: return "/money"
        case .workout: return "/body/workout"
        default: return "/today"
        }
    }

    static func money(_ n: Double) -> String {
        let r = (n * 100).rounded() / 100
        if r == r.rounded() { return "$\(Int(r))" }
        return String(format: "$%.2f", r)
    }

    /// Never let a dash character reach a notification.
    static func clean(_ s: String) -> String {
        var swapped = ""
        for u in s.unicodeScalars {
            if u.value >= 0x2012 && u.value <= 0x2015 {
                swapped += ", "
            } else {
                swapped.unicodeScalars.append(u)
            }
        }
        let tight = swapped.replacingOccurrences(of: "\\s+,", with: ",", options: .regularExpression)
        return tight.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// A stable name for a block across "still on the template" and "edited for today".
    static func blockKey(_ b: ReminderBlock) -> String {
        if let t = b.templateId, !t.isEmpty { return "t.\(t)" }
        var id = b.id
        if id.hasPrefix("template:") { id = String(id.dropFirst("template:".count)) }
        return "b.\(id)"
    }

    static func blockTime(_ start: TimeStr, _ offset: Int) -> TimeStr? {
        let m = LIDate.minutesOf(start) + offset
        // An offset that would cross midnight belongs to another day. Skip it.
        if m < 0 || m >= 24 * 60 { return nil }
        return LIDate.addMinutes(start, offset)
    }

    /// Every notification one day could send, in time order.
    ///
    /// Left out: disabled reminders, anything inside quiet hours, the workout reminder on a rest day.
    /// The earnings nudge is always planned (so a screen can list it) and dropped when `forSend` is on and the floor is met.
    public static func planDay(_ reminders: [Reminder], _ day: ReminderDay, _ opts: ReminderPlanOptions, forSend: Bool = false) -> [PlannedNotification] {
        var out: [PlannedNotification] = []

        func push(_ r: Reminder, _ key: String, _ time: TimeStr, _ title: String, _ body: String) {
            if LIDate.isQuiet(time, quietStart: opts.quietStart, quietEnd: opts.quietEnd) { return }
            out.append(PlannedNotification(
                key: "\(day.date):\(key)",
                reminderId: r.id,
                kind: r.kind,
                date: day.date,
                time: time,
                at: LIDate.nyInstant(day.date, time),
                title: clean(title),
                body: clean(body),
                url: urlFor(r.kind)
            ))
        }

        for r in reminders {
            if !r.enabled { continue }

            guard let time = r.time else {
                // Relative to the start of every block whose name starts with block_name.
                let prefix = (r.blockName ?? "").trimmingCharacters(in: .whitespaces).lowercased()
                if prefix.isEmpty { continue }
                for b in day.blocks {
                    if !b.blockName.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix(prefix) { continue }
                    guard let t = blockTime(b.start, r.offsetMinutes) else { continue }
                    let mins = abs(r.offsetMinutes)
                    let when = r.offsetMinutes < 0 ? "Starts in \(mins) min, at \(LIDate.formatTime(b.start))." : "Starts at \(LIDate.formatTime(b.start))."
                    push(r, "\(r.id):\(blockKey(b))", t, b.blockName, when)
                }
                continue
            }

            if r.kind == .workout && day.restDay { continue }

            if r.kind == .earningsNudge {
                if forSend && day.earned >= opts.floor { continue }
                let left = max(0, opts.floor - day.earned)
                let lead = "\(money(day.earned)) of \(money(opts.floor)) today. \(money(left)) to go."
                let extra = r.body ?? ""
                push(r, r.id, time, r.label, extra.isEmpty ? lead : "\(lead) \(extra)")
                continue
            }

            push(r, r.id, time, r.label, r.body ?? "")
        }

        return out.sorted { a, b in
            if a.at != b.at { return a.at < b.at }
            return a.key < b.key
        }
    }
}
