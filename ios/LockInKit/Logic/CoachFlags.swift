import Foundation

// Coach pattern flags. Port of src/lib/logic/coachFlags.ts: explicit rules over the raw rows, nothing learned.
// Only finished days count. A day with nothing logged proves nothing, so it ends a run instead of counting as a miss.

public enum CoachFlags {
    typealias T = CoachText

    public static let runDays = 3
    public static let bedMisses = 3
    public static let bedWindow = 7
    public static let wakePairs = 2
    public static let viceSameTime = 3
    public static let viceSameTrigger = 2
    public static let liftNoise = 0.01
    public static let rateDrop = 0.15
    public static let lookbackDays = 14

    static let order = ["earned_under", "protein_under", "lift_drop", "wake_after_late", "bed_missed", "vice_pattern", "rate_drop"]

    enum Result {
        case done, missed, skip
    }

    struct Ctx {
        let data: CoachData
        let days: [DateStr]
        let touched: Set<DateStr>
        let index: [String: DayLog]

        init(_ data: CoachData) {
            self.data = data
            var days: [DateStr] = []
            if let range = CoachSnapshotBuilder.completedRange(historyStart: data.historyStart, today: data.today) {
                days = Array(LIDate.dateRange(range.from, range.to).suffix(CoachFlags.lookbackDays))
            }
            self.days = days
            self.touched = CoachSnapshotBuilder.touchedDates(data.logs)
            var idx: [String: DayLog] = [:]
            for l in data.logs { idx["\(l.itemId)|\(l.date)"] = l }
            self.index = idx
        }

        func logAt(_ itemId: String, _ date: DateStr) -> DayLog? {
            return index["\(itemId)|\(date)"]
        }

        func item(_ key: String) -> ChecklistItem? {
            return data.items.first(where: { $0.key == key })
        }

        func result(_ item: ChecklistItem, _ date: DateStr) -> Result {
            if !touched.contains(date) || !Targets.isActiveOn(item, data.versions, date) { return .skip }
            let state = Scoring.itemState(item, Targets.targetOn(item, data.versions, date), logAt(item.id, date))
            return state == .done ? .done : .missed
        }
    }

    /// The unbroken run of missed days ending on the last finished day.
    static func missRun(_ ctx: Ctx, _ item: ChecklistItem) -> [DateStr] {
        var run: [DateStr] = []
        for d in ctx.days.reversed() {
            if ctx.result(item, d) != .missed { break }
            run.insert(d, at: 0)
        }
        return run
    }

    static func numberTarget(_ ctx: Ctx, _ item: ChecklistItem, _ date: DateStr) -> Double? {
        switch Targets.targetOn(item, ctx.data.versions, date) {
        case .min(let m): return m
        case .range(let lo, _): return lo
        default: return nil
        }
    }

    static func ev(_ label: String, _ value: String) -> FlagEvidenceLine {
        return FlagEvidenceLine(label: label, value: value)
    }

    // MARK: protein and earnings

    static func proteinUnder(_ ctx: Ctx) -> [CoachFlag] {
        guard let item = ctx.item("protein") else { return [] }
        let run = missRun(ctx, item)
        if run.count < runDays { return [] }
        guard let target = numberTarget(ctx, item, run[run.count - 1]) else { return [] }
        let values: [Double?] = run.map { ctx.logAt(item.id, $0)?.value }
        let logged = values.compactMap { $0 }
        var avg: Double? = nil
        if !logged.isEmpty { avg = T.jsRound(logged.reduce(0, +) / Double(logged.count)) }
        var gap: Double? = nil
        if let a = avg { gap = max(0, target - a) }
        let detail: String
        if let a = avg, let g = gap {
            detail = "Averaged \(T.withUnit(a, item.unit)) on the days you logged, \(T.withUnit(g, item.unit)) short of \(T.withUnit(target, item.unit))."
        } else {
            detail = "Nothing logged for protein on any of the \(run.count) days."
        }
        let change: String
        if let g = gap, g > 0 {
            change = "Add one meal or shake with \(T.withUnit(min(60, (g / 5).rounded(.up) * 5), item.unit)) of protein right after the workout. That closes the gap."
        } else {
            change = "Log protein at every meal so the day's number is real."
        }
        var evidence: [FlagEvidenceLine] = []
        for (i, d) in run.enumerated() {
            let v = values[i]
            evidence.append(ev(LIDate.formatDateShort(d), v == nil ? "not logged" : "\(T.withUnit(v ?? 0, item.unit)) of \(T.withUnit(target, item.unit))"))
        }
        return [CoachFlag(key: "protein_under", kind: "protein_under", title: "Protein under \(T.withUnit(target, item.unit)) \(run.count) days running", detail: detail, change: change, evidence: evidence, since: run[0])]
    }

    static func earnedUnder(_ ctx: Ctx) -> [CoachFlag] {
        guard let item = ctx.item("earned") else { return [] }
        let run = missRun(ctx, item)
        if run.count < runDays { return [] }
        let floor = numberTarget(ctx, item, run[run.count - 1]) ?? ctx.data.floor
        let values: [Double] = run.map { ctx.logAt(item.id, $0)?.value ?? 0 }
        let short = values.reduce(0.0) { $0 + max(0, floor - $1) }
        var evidence: [FlagEvidenceLine] = []
        for (i, d) in run.enumerated() {
            evidence.append(ev(LIDate.formatDateShort(d), "\(T.money(values[i])) of \(T.money(floor))"))
        }
        return [CoachFlag(
            key: "earned_under",
            kind: "earned_under",
            title: "Under the \(T.money(floor)) floor \(run.count) days running",
            detail: "\(T.money(short)) short of the floor across those \(run.count) days.",
            change: "Start the first delivery block on time and do not end it until the day reads \(T.money(floor)).",
            evidence: evidence,
            since: run[0]
        )]
    }

    // MARK: bed and wake

    static func bedNights(_ ctx: Ctx, _ item: ChecklistItem) -> [(date: DateStr, hit: Bool)] {
        let lastNight = LIDate.addDays(ctx.data.today, -1)
        var out: [(date: DateStr, hit: Bool)] = []
        for d in ctx.days {
            let r = ctx.result(item, d)
            if r == .skip { continue }
            if d == lastNight && r == .missed { continue }
            out.append((date: d, hit: r == .done))
        }
        return out
    }

    static func bedMissed(_ ctx: Ctx) -> [CoachFlag] {
        guard let item = ctx.item("bed") else { return [] }
        let nights = Array(bedNights(ctx, item).suffix(bedWindow))
        let missed = nights.filter { !$0.hit }
        if missed.count < bedMisses { return [] }
        let evidence = nights.map { ev(LIDate.formatDateShort($0.date), $0.hit ? "on time" : "missed") }
        return [CoachFlag(
            key: "bed_missed",
            kind: "bed_missed",
            title: "Bedtime missed \(missed.count) of the last \(nights.count) nights",
            detail: "In bed on time \(nights.count - missed.count) of \(T.plural(nights.count, "night")).",
            change: "Set an alarm 30 minutes before bed time. When it goes, screens off and the last block ends.",
            evidence: evidence,
            since: missed[0].date
        )]
    }

    static func wakeAfterLate(_ ctx: Ctx) -> [CoachFlag] {
        guard let bed = ctx.item("bed"), let wake = ctx.item("wake") else { return [] }
        let nights = bedNights(ctx, bed)
        var lateTotal = 0
        var onTimeTotal = 0
        var onTimeWakeHit = 0
        var pairs: [(night: DateStr, morning: DateStr)] = []
        for n in nights {
            let morning = LIDate.addDays(n.date, 1)
            if morning >= ctx.data.today { continue }
            let w = ctx.result(wake, morning)
            if w == .skip { continue }
            if n.hit {
                onTimeTotal += 1
                if w == .done { onTimeWakeHit += 1 }
            } else {
                lateTotal += 1
                if w == .missed { pairs.append((night: n.date, morning: morning)) }
            }
        }
        if pairs.count < wakePairs { return [] }
        let lateMissRate = Double(pairs.count) / Double(lateTotal)
        let onTimeMissRate = onTimeTotal > 0 ? Double(onTimeTotal - onTimeWakeHit) / Double(onTimeTotal) : 0
        if lateMissRate <= onTimeMissRate { return [] }
        var evidence = pairs.map { ev("Night of \(LIDate.formatDateShort($0.night))", "wake missed \(LIDate.formatDateShort($0.morning))") }
        if onTimeTotal > 0 { evidence.append(ev("After on time nights", "up on time \(onTimeWakeHit) of \(onTimeTotal)")) }
        var detail = "Wake was missed after \(pairs.count) of \(T.plural(lateTotal, "late night"))"
        if onTimeTotal > 0 { detail += ", and hit after \(onTimeWakeHit) of \(T.plural(onTimeTotal, "on time night"))" }
        detail += "."
        return [CoachFlag(
            key: "wake_after_late",
            kind: "wake_after_late",
            title: "Wake time goes after late nights",
            detail: detail,
            change: "The wake is decided the night before. Hold bed time tonight and the morning takes care of itself.",
            evidence: evidence,
            since: pairs[0].night
        )]
    }

    // MARK: vices

    struct DayPart {
        let name: String
        let label: String
        let from: Int
        let to: Int
    }

    static let dayParts: [DayPart] = [
        DayPart(name: "morning", label: "in the morning (5 AM to noon)", from: 300, to: 720),
        DayPart(name: "afternoon", label: "in the afternoon (noon to 5 PM)", from: 720, to: 1020),
        DayPart(name: "evening", label: "in the evening (5 PM to 9 PM)", from: 1020, to: 1260),
        DayPart(name: "late night", label: "late at night (9 PM to 5 AM)", from: 1260, to: 1740),
    ]

    static func dayPart(_ time: String) -> DayPart {
        var m = LIDate.minutesOf(time)
        if m < 300 { m += 1440 }
        return dayParts.first(where: { m >= $0.from && m < $0.to }) ?? dayParts[3]
    }

    static func normTrigger(_ t: String?) -> String {
        var s = (t ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "[.!]+$", with: "", options: .regularExpression)
        return s
    }

    /// Groups in first seen order. The largest wins, and the first seen wins a tie.
    static func topGroup(_ groups: [(key: String, slips: [ViceSlip])]) -> (key: String, slips: [ViceSlip])? {
        var best: (key: String, slips: [ViceSlip])? = nil
        for g in groups {
            if best == nil || g.slips.count > (best?.slips.count ?? 0) { best = g }
        }
        return best
    }

    static func add(_ groups: inout [(key: String, slips: [ViceSlip])], _ key: String, _ slip: ViceSlip) {
        if let i = groups.firstIndex(where: { $0.key == key }) {
            groups[i].slips.append(slip)
        } else {
            groups.append((key: key, slips: [slip]))
        }
    }

    static func vicePatterns(_ ctx: Ctx) -> [CoachFlag] {
        let data = ctx.data
        let from = LIDate.addDays(data.today, -lookbackDays)
        var out: [CoachFlag] = []
        for item in data.items where item.category == .vice {
            let slips = data.slips
                .filter { $0.itemId == item.id && $0.date >= from && $0.date <= data.today && $0.date >= data.historyStart }
                .sorted { ($0.date + $0.time) < ($1.date + $1.time) }
            if slips.count < min(viceSameTime, viceSameTrigger) { continue }
            var byPart: [(key: String, slips: [ViceSlip])] = []
            var byTrigger: [(key: String, slips: [ViceSlip])] = []
            for s in slips {
                add(&byPart, dayPart(s.time).name, s)
                let trig = normTrigger(s.trigger)
                if !trig.isEmpty { add(&byTrigger, trig, s) }
            }
            var timeHit: (key: String, slips: [ViceSlip])? = nil
            if let p = topGroup(byPart), p.slips.count >= viceSameTime { timeHit = p }
            var triggerHit: (key: String, slips: [ViceSlip])? = nil
            if let t = topGroup(byTrigger), t.slips.count >= viceSameTrigger { triggerHit = t }
            if timeHit == nil && triggerHit == nil { continue }

            let name = T.viceName(item.name)
            let cap = String(name.prefix(1)).uppercased() + String(name.dropFirst())
            var part: DayPart? = nil
            if let th = timeHit { part = dayParts.first(where: { $0.name == th.key }) }
            var bits: [String] = []
            if let th = timeHit, let p = part { bits.append("\(th.slips.count) of \(T.plural(slips.count, "slip")) came \(p.label)") }
            if let tr = triggerHit { bits.append("\(tr.slips.count) of \(slips.count) logged \"\(tr.key)\" as the trigger") }
            var shown = Set<String>()
            if let th = timeHit { for s in th.slips { shown.insert(s.id) } }
            if let tr = triggerHit { for s in tr.slips { shown.insert(s.id) } }
            let title: String
            if let th = timeHit, let tr = triggerHit {
                title = "\(cap) slips: \(th.key), \"\(tr.key)\""
            } else if let th = timeHit {
                title = "\(cap) slips cluster " + (part?.name == "late night" ? "late at night" : "in the \(th.key)")
            } else {
                title = "\(cap) slips share a trigger: \"\(triggerHit?.key ?? "")\""
            }
            let change: String
            if let tr = triggerHit {
                change = "Decide now what you do right after \"\(tr.key)\" and put it on the schedule as a block."
            } else {
                change = "Put a block on the schedule for the \(timeHit?.key ?? "") window so that time already has a plan."
            }
            let evidence: [FlagEvidenceLine] = slips.filter { shown.contains($0.id) }.map { s in
                let trig = (s.trigger ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                return ev("\(LIDate.formatDateShort(s.date)), \(LIDate.formatTime(s.time))", trig.isEmpty ? "no trigger logged" : trig)
            }
            out.append(CoachFlag(
                key: "vice_pattern:\(item.id)",
                kind: "vice_pattern",
                title: title,
                detail: "In the last \(lookbackDays) days, \(bits.joined(separator: " and ")).",
                change: change,
                evidence: evidence,
                since: slips[0].date
            ))
        }
        return out
    }

    // MARK: lifts

    static func liftDrops(_ ctx: Ctx) -> [CoachFlag] {
        let data = ctx.data
        let unit = data.weightUnit.isEmpty ? "lb" : data.weightUnit
        let thisWeek = LIDate.weekStart(data.today)
        var out: [CoachFlag] = []
        for (exercise, sets) in CoachSnapshotBuilder.topSets(data.setLogs.filter { $0.date <= data.today }, unit: unit) {
            var weeks: [DateStr: CoachSnapshotBuilder.TopSet] = [:]
            for s in sets {
                let w = LIDate.weekStart(s.date)
                if let prev = weeks[w], s.score <= prev.score { continue }
                weeks[w] = s
            }
            let ordered = weeks.sorted { $0.key < $1.key }
            let last3 = Array(ordered.suffix(3))
            if last3.count < 3 { continue }
            let a = last3[0], b = last3[1], c = last3[2]
            if LIDate.addDays(a.key, 7) != b.key || LIDate.addDays(b.key, 7) != c.key { continue }
            if c.key != thisWeek && c.key != LIDate.addDays(thisWeek, -7) { continue }
            if (a.value.weight > 0) != (b.value.weight > 0) || (b.value.weight > 0) != (c.value.weight > 0) { continue }
            func drop(_ x: Double, _ y: Double) -> Bool { return y < x * (1 - liftNoise) }
            if !drop(a.value.score, b.value.score) || !drop(b.value.score, c.value.score) { continue }
            let pct = Int(T.jsRound((1 - c.value.score / a.value.score) * 100))
            let load = b.value.weight > 0 ? "\(T.decimal(T.round1(b.value.weight), minFraction: 0, maxFraction: 3)) \(unit)" : "the same reps as last week"
            out.append(CoachFlag(
                key: "lift_drop:\(exercise.lowercased())",
                kind: "lift_drop",
                title: "\(exercise) down two weeks in a row",
                detail: "Best set went \(a.value.label), then \(b.value.label), then \(c.value.label). About \(pct) percent off in two weeks.",
                change: "Next \(exercise.lowercased()) session, load \(load) and get every rep before adding anything.",
                evidence: last3.map { ev("Week of \(LIDate.formatDateShort($0.key))", "\($0.value.label) on \(LIDate.formatDateShort($0.value.date))") },
                since: a.value.date
            ))
        }
        return out.sorted { $0.key < $1.key }
    }

    // MARK: hourly rate

    static func rateDrops(_ ctx: Ctx) -> [CoachFlag] {
        let data = ctx.data
        let from = LIDate.addDays(data.today, -lookbackDays)
        let rated = data.earnings.filter { ($0.hours ?? 0) > 0 && $0.date >= from && $0.date <= data.today }
        var apps: [String] = []
        var byApp: [String: [DateStr: (amount: Double, hours: Double)]] = [:]
        for e in rated {
            if byApp[e.app] == nil {
                byApp[e.app] = [:]
                apps.append(e.app)
            }
            var d = byApp[e.app]?[e.date] ?? (amount: 0, hours: 0)
            d.amount += e.amount
            d.hours += e.hours ?? 0
            byApp[e.app]?[e.date] = d
        }
        func rate(_ d: (amount: Double, hours: Double)) -> Double { return d.amount / d.hours }
        func perHour(_ n: Double) -> String { return T.money(T.jsRound(n * 100) / 100) + "/h" }
        var out: [CoachFlag] = []
        for app in apps {
            let days = byApp[app] ?? [:]
            let last3 = Array(days.sorted { $0.key < $1.key }.suffix(3))
            if last3.count < 3 { continue }
            let r1 = rate(last3[0].value), r2 = rate(last3[1].value), r3 = rate(last3[2].value)
            if !(r2 < r1 && r3 < r2 && r3 <= r1 * (1 - rateDrop)) { continue }
            var better: (app: String, rate: Double)? = nil
            for other in apps where other != app {
                let span = (byApp[other] ?? [:]).filter { $0.key >= last3[0].key }
                let hours = span.values.reduce(0.0) { $0 + $1.hours }
                if hours <= 0 { continue }
                let r = span.values.reduce(0.0) { $0 + $1.amount } / hours
                if r > r3 && (better == nil || r > (better?.rate ?? 0)) { better = (app: other, rate: r) }
            }
            var detail = "\(perHour(r1)), then \(perHour(r2)), then \(perHour(r3)) over the last three \(app) days"
            if let b = better { detail += ". \(b.app) paid \(perHour(b.rate)) over the same stretch" }
            detail += "."
            let change: String
            if let b = better {
                change = "Run the next delivery block on \(b.app) first and switch to \(app) only when it goes quiet."
            } else {
                change = "Change one thing on the next \(app) block, the zone or the start time, and compare the rate."
            }
            let evidence = last3.map { ev(LIDate.formatDateShort($0.key), "\(perHour(rate($0.value))) (\(T.money(T.jsRound($0.value.amount * 100) / 100)) in \(T.decimal(T.round1($0.value.hours), minFraction: 0, maxFraction: 3))h)") }
            out.append(CoachFlag(key: "rate_drop:\(app.lowercased())", kind: "rate_drop", title: "\(app) hourly rate is falling", detail: detail, change: change, evidence: evidence, since: last3[0].key))
        }
        return out.sorted { $0.key < $1.key }
    }

    // MARK: all

    /// Every pattern the rules can see today, most important first.
    public static func detect(_ data: CoachData) -> [CoachFlag] {
        let ctx = Ctx(data)
        var all: [CoachFlag] = []
        all.append(contentsOf: earnedUnder(ctx))
        all.append(contentsOf: proteinUnder(ctx))
        all.append(contentsOf: liftDrops(ctx))
        all.append(contentsOf: wakeAfterLate(ctx))
        all.append(contentsOf: bedMissed(ctx))
        all.append(contentsOf: vicePatterns(ctx))
        all.append(contentsOf: rateDrops(ctx))
        return all.enumerated().sorted { a, b in
            let ia = order.firstIndex(of: a.element.kind) ?? 99
            let ib = order.firstIndex(of: b.element.kind) ?? 99
            if ia != ib { return ia < ib }
            return a.offset < b.offset
        }.map { $0.element }
    }

    /// The flag as the snapshot carries it.
    public static func json(_ f: CoachFlag) -> JSON {
        return .object([
            "kind": .string(f.kind),
            "title": .string(f.title),
            "detail": .string(f.detail),
            "change": .string(f.change),
            "evidence": .array(f.evidence.map { JSON.object(["label": .string($0.label), "value": .string($0.value)]) }),
        ])
    }
}
