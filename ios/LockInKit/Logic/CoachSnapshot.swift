import Foundation

// Coach, step 1: the deterministic part. Turns raw rows into the compact snapshot the coach writes from.
// Port of buildSnapshot and friends in src/lib/logic/coach.ts. Pattern flags (coachFlags.ts) are not detected on the
// phone yet: the snapshot carries an empty flag list and the web app's saved flag notes are shown as they are.

public struct CoachBlock: Equatable {
    public var blockName: String
    public var start: TimeStr
    public var end: TimeStr
    public var kind: String
    public init(blockName: String, start: TimeStr, end: TimeStr, kind: String) {
        self.blockName = blockName
        self.start = start
        self.end = end
        self.kind = kind
    }
}

/// Every row the coach reads.
public struct CoachData {
    public var today: DateStr
    /// First date of the ongoing history. Nothing before it is scored.
    public var historyStart: DateStr
    /// The challenge running today. Nil in ongoing mode.
    public var challenge: Challenge?
    public var floor: Double
    public var weightUnit: String
    public var carbsTarget: Double
    public var fatTarget: Double
    public var focusGoalMinutes: Int
    public var items: [ChecklistItem]
    public var versions: [TargetVersion]
    public var logs: [DayLog]
    public var earnings: [Earning]
    public var meals: [Meal]
    public var bodyLogs: [BodyLog]
    public var setLogs: [SetLog]
    public var slips: [ViceSlip]
    public var workouts: [Workout]
    public var blocks: [CoachBlock]
    public var focus: [FocusSession]

    public init(today: DateStr, historyStart: DateStr, challenge: Challenge? = nil, floor: Double = 0, weightUnit: String = "lb", carbsTarget: Double = 0, fatTarget: Double = 0, focusGoalMinutes: Int = 0, items: [ChecklistItem] = [], versions: [TargetVersion] = [], logs: [DayLog] = [], earnings: [Earning] = [], meals: [Meal] = [], bodyLogs: [BodyLog] = [], setLogs: [SetLog] = [], slips: [ViceSlip] = [], workouts: [Workout] = [], blocks: [CoachBlock] = [], focus: [FocusSession] = []) {
        self.today = today
        self.historyStart = historyStart
        self.challenge = challenge
        self.floor = floor
        self.weightUnit = weightUnit
        self.carbsTarget = carbsTarget
        self.fatTarget = fatTarget
        self.focusGoalMinutes = focusGoalMinutes
        self.items = items
        self.versions = versions
        self.logs = logs
        self.earnings = earnings
        self.meals = meals
        self.bodyLogs = bodyLogs
        self.setLogs = setLogs
        self.slips = slips
        self.workouts = workouts
        self.blocks = blocks
        self.focus = focus
    }
}

public struct MissLine: Equatable {
    public var key: String?
    public var name: String
    /// "open": nothing logged. "off": logged but short of the target.
    public var state: String
    public var logged: String?
    public var target: String
    public var gap: String?
}

public struct YesterdayLine: Equatable {
    public var date: DateStr
    public var label: String
    public var status: DayStatus
    public var done: Int
    public var total: Int
    public var misses: [MissLine]
    public var pending: [String]
}

public struct WeekItemLine: Equatable {
    public var key: String?
    public var name: String
    public var hits: Int
    public var of: Int
    public var note: String?
}

public struct WeekLine {
    public var json: JSONObject
    public var items: [WeekItemLine]
}

public enum CoachSnapshotBuilder {
    typealias T = CoachText

    // MARK: small pieces

    static func str(_ s: String?) -> JSON { return JSON.str(s) }
    static func num(_ d: Double) -> JSON { return .number(d) }
    static func int(_ i: Int) -> JSON { return .number(Double(i)) }
    static func strings(_ a: [String]) -> JSON { return .array(a.map { JSON.string($0) }) }

    static func sum(_ ns: [Double]) -> Double {
        return T.jsRound(ns.reduce(0, +) * 100) / 100
    }

    /// Whether anything at all was logged on a date.
    public static func touchedDates(_ logs: [DayLog]) -> Set<DateStr> {
        var out = Set<DateStr>()
        for l in logs {
            if l.checked || l.value != nil || !(l.text ?? "").trimmingCharacters(in: .whitespaces).isEmpty { out.insert(l.date) }
        }
        return out
    }

    /// First and last days of the history that are over (yesterday at the latest). Nil on the first day.
    public static func completedRange(historyStart: DateStr, today: DateStr) -> (from: DateStr, to: DateStr)? {
        let to = LIDate.addDays(today, -1)
        return to >= historyStart ? (historyStart, to) : nil
    }

    static func gapFor(_ target: Target, _ value: Double?, _ unit: String?) -> String? {
        guard let value = value else { return nil }
        switch target {
        case .min(let lo):
            if value < lo { return T.withUnit(lo - value, unit) + " under" }
        case .max(let hi):
            if value > hi { return T.withUnit(value - hi, unit) + " over" }
        case .range(let lo, let hi):
            if value < lo { return T.withUnit(lo - value, unit) + " under" }
            if value > hi { return T.withUnit(value - hi, unit) + " over" }
        default:
            break
        }
        return nil
    }

    static func isNumberTarget(_ t: Target) -> Bool {
        switch t {
        case .min, .max, .range: return true
        default: return false
        }
    }

    public static func missLine(_ r: ItemResult) -> MissLine {
        let value = r.log?.value
        let isNumber = isNumberTarget(r.target)
        return MissLine(
            key: r.item.key,
            name: r.item.name,
            state: r.state == .off ? "off" : "open",
            logged: (isNumber && value != nil) ? T.withUnit(value ?? 0, r.item.unit) : nil,
            target: Targets.describeTarget(r.target, unit: r.item.unit),
            gap: isNumber ? gapFor(r.target, value, r.item.unit) : nil
        )
    }

    // MARK: top sets

    public struct TopSet {
        public var date: DateStr
        public var weight: Double
        public var reps: Int
        public var score: Double
        public var label: String
    }

    /// Best set of a session, per exercise, oldest first. Weighted sets compare by estimated one rep max, bodyweight sets by reps.
    public static func topSets(_ setLogs: [SetLog], unit: String) -> [(name: String, sets: [TopSet])] {
        var names: [String] = []
        var byExercise: [String: [DateStr: TopSet]] = [:]
        for s in setLogs {
            let reps = s.reps ?? 0
            let weight = s.weight ?? 0
            if reps <= 0 { continue }
            let score = weight > 0 ? weight * (1 + Double(reps) / 30) : Double(reps)
            let label = weight > 0 ? "\(T.decimal(T.round1(weight), minFraction: 0, maxFraction: 3)) \(unit) x \(reps)" : T.plural(reps, "rep")
            let name = s.exercise.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty { continue }
            if byExercise[name] == nil {
                byExercise[name] = [:]
                names.append(name)
            }
            let candidate = TopSet(date: s.date, weight: weight, reps: reps, score: score, label: label)
            if let prev = byExercise[name]?[s.date] {
                if (weight > 0 && prev.weight == 0) || ((weight > 0) == (prev.weight > 0) && score > prev.score) {
                    byExercise[name]?[s.date] = candidate
                }
            } else {
                byExercise[name]?[s.date] = candidate
            }
        }
        return names.map { n in
            let sets = (byExercise[n] ?? [:]).values.sorted { $0.date < $1.date }
            return (name: n, sets: sets)
        }
    }

    // MARK: money

    static func buildMoney(_ data: CoachData) -> JSONObject {
        let today = data.today
        let historyStart = data.historyStart
        let c = data.challenge
        let counted = data.earnings.filter { $0.date >= historyStart && $0.date <= today }
        // A money target belongs to a challenge. Without one there is only the floor.
        var target = 0.0
        if let c = c, let t = c.moneyTarget, let d = c.moneyDeadline, !d.isEmpty { target = t }
        var deadline = today
        if let c = c, let d = c.moneyDeadline, !d.isEmpty, target > 0 { deadline = d }
        var since = historyStart
        if let c = c {
            if let s = c.moneyTargetStart, s > c.startDate { since = s } else { since = c.startDate }
        }
        let total = sum(counted.filter { $0.date >= since }.map { $0.amount })
        func onDate(_ d: DateStr) -> Double { return sum(counted.filter { $0.date == d }.map { $0.amount }) }
        let remaining = max(0, T.jsRound((target - total) * 100) / 100)
        let daysLeft = (target <= 0 || today > deadline) ? 0 : LIDate.diffDays(today, deadline) + 1
        let state = (target > 0 && total >= target) ? "hit" : ((target > 0 && today > deadline) ? "past" : "active")
        let neededPerDay: Int? = daysLeft > 0 ? Int((remaining / Double(daysLeft)).rounded(.up)) : nil
        let yesterday = LIDate.addDays(today, -1)
        let from14 = LIDate.addDays(today, -14)

        var appOrder: [String] = []
        var apps: [String: (amount: Double, hours: Double, rated: Double)] = [:]
        for e in counted where e.date >= from14 {
            var a = apps[e.app] ?? (amount: 0, hours: 0, rated: 0)
            if apps[e.app] == nil { appOrder.append(e.app) }
            a.amount += e.amount
            if let h = e.hours, h > 0 {
                a.hours += h
                a.rated += e.amount
            }
            apps[e.app] = a
        }
        let last7From = LIDate.addDays(today, -7) < historyStart ? historyStart : LIDate.addDays(today, -7)
        var last7: [JSON] = []
        if yesterday >= last7From {
            for d in LIDate.dateRange(last7From, yesterday) {
                last7.append(.object(["date": .string(d), "label": .string(LIDate.formatDateShort(d)), "amount": num(onDate(d))]))
            }
        }
        let appLines = appOrder
            .map { app -> (String, Double, Double, Double?) in
                let a = apps[app] ?? (amount: 0, hours: 0, rated: 0)
                let perHour: Double? = a.hours > 0 ? T.jsRound((a.rated / a.hours) * 100) / 100 : nil
                return (app, sum([a.amount]), T.round1(a.hours), perHour)
            }
            .enumerated()
            .sorted { x, y in
                if x.element.1 != y.element.1 { return x.element.1 > y.element.1 }
                return x.offset < y.offset
            }
            .map { $0.element }
            .map { JSON.object(["app": .string($0.0), "amount": num($0.1), "hours": num($0.2), "perHour": JSON.num($0.3)]) }

        var out: JSONObject = [:]
        out["total"] = num(total)
        out["target"] = num(target)
        out["deadline"] = .string(deadline)
        out["deadlineLabel"] = .string(LIDate.formatDateShort(deadline))
        out["state"] = .string(state)
        out["remaining"] = num(remaining)
        out["daysLeft"] = int(daysLeft)
        out["neededPerDay"] = neededPerDay.map { int($0) } ?? JSON.null
        out["floor"] = num(data.floor)
        out["floorCovers"] = .bool(neededPerDay != nil && Double(neededPerDay ?? 0) <= data.floor)
        out["earnedYesterday"] = yesterday >= historyStart ? num(onDate(yesterday)) : JSON.null
        out["earnedToday"] = num(onDate(today))
        out["last7"] = .array(last7)
        out["apps"] = .array(appLines)
        return out
    }

    // MARK: the week

    /// One Monday to Sunday week, scored up to `today`.
    public static func buildWeek(_ data: CoachData, anyDateInWeek: DateStr) -> WeekLine {
        let today = data.today
        let items = data.items
        let start = LIDate.weekStart(anyDateInWeek)
        let end = LIDate.weekEnd(anyDateInWeek)
        let from = start < data.historyStart ? data.historyStart : start
        let to = end < today ? end : today
        let days: [DateStr] = from <= to ? LIDate.dateRange(from, to) : []

        let lastNight = LIDate.addDays(today, -1)
        var full = 0
        var partial = 0
        var missed = 0
        var order: [String] = []
        var perItem: [String: (item: ChecklistItem, hits: Int, of: Int, values: [Double])] = [:]
        for d in days {
            let s = Scoring.summarizeDay(d, items, data.versions, data.logs)
            if s.status == .full { full += 1 } else if s.status == .partial { partial += 1 } else { missed += 1 }
            for r in s.items {
                // Last night's bedtime is ticked this morning. Until then it is not a miss.
                if r.item.key == "bed" && r.state == .open && d == lastNight { continue }
                var row = perItem[r.item.id] ?? (item: r.item, hits: 0, of: 0, values: [])
                if perItem[r.item.id] == nil { order.append(r.item.id) }
                row.of += 1
                if r.done { row.hits += 1 }
                if let v = r.log?.value { row.values.append(v) }
                perItem[r.item.id] = row
            }
        }
        let rows = order.compactMap { perItem[$0] }.enumerated().sorted { a, b in
            if a.element.item.sortOrder != b.element.item.sortOrder { return a.element.item.sortOrder < b.element.item.sortOrder }
            return a.offset < b.offset
        }.map { $0.element }

        var lineItems: [WeekItemLine] = []
        for r in rows {
            var note: String? = nil
            if r.item.type == .number && !r.values.isEmpty && r.item.key != "earned" {
                let avg = T.jsRound(sum(r.values) / Double(r.values.count))
                note = "averaged \(T.withUnit(avg, r.item.unit)) on \(T.plural(r.values.count, "logged day")), target \(Targets.describeTarget(r.item.target, unit: r.item.unit))"
            }
            lineItems.append(WeekItemLine(key: r.item.key, name: r.item.name, hits: r.hits, of: r.of, note: note))
        }
        let held = lineItems.filter { $0.of > 0 && $0.hits == $0.of }.map { $0.name }
        let slipped = lineItems.enumerated()
            .filter { $0.element.hits < $0.element.of }
            .sorted { a, b in
                let ga = a.element.of - a.element.hits
                let gb = b.element.of - b.element.hits
                if ga != gb { return ga > gb }
                return a.offset < b.offset
            }
            .map { $0.element.name }

        var weekly: [JSON] = []
        if let first = days.first {
            let wk = Scoring.summarizeWeek(first, items, data.versions, data.logs, asOf: to)
            weekly = wk.items.map { JSON.object(["name": .string($0.item.name), "done": .bool($0.done)]) }
        }
        let earnedByDay = days.map { d in sum(data.earnings.filter { $0.date == d }.map { $0.amount }) }
        var slipOrder: [String] = []
        var slipCounts: [String: Int] = [:]
        for s in data.slips {
            guard let first = days.first, s.date >= first, s.date <= to else { continue }
            guard let item = items.first(where: { $0.id == s.itemId }) else { continue }
            let name = T.viceName(item.name)
            if slipCounts[name] == nil { slipOrder.append(name) }
            slipCounts[name, default: 0] += 1
        }
        let weights = data.bodyLogs
            .filter { $0.weight != nil && !days.isEmpty && $0.date <= to }
            .sorted { $0.date < $1.date }
        let inWeek = weights.filter { $0.date >= start }
        let before = weights.filter { $0.date < start }
        var weightChange: String? = nil
        if let nowLog = inWeek.last, let prevLog = before.last {
            let now = nowLog.weight ?? 0
            let prev = prevLog.weight ?? 0
            let delta = T.round1(now - prev)
            let nowText = T.decimal(now, minFraction: 0, maxFraction: 3)
            let prevText = T.decimal(prev, minFraction: 0, maxFraction: 3)
            if delta == 0 {
                weightChange = "flat at \(nowText) \(data.weightUnit)"
            } else {
                weightChange = "\(delta < 0 ? "down" : "up") \(T.decimal(abs(delta), minFraction: 0, maxFraction: 3)) \(data.weightUnit), \(prevText) to \(nowText)"
            }
        }

        var itemJson: [JSON] = []
        for l in lineItems {
            itemJson.append(.object(["key": str(l.key), "name": .string(l.name), "hits": int(l.hits), "of": int(l.of), "note": str(l.note)]))
        }
        var out: JSONObject = [:]
        out["start"] = .string(start)
        out["end"] = .string(end)
        out["label"] = .string("\(LIDate.formatDateShort(start)) to \(LIDate.formatDateShort(end))")
        out["daysScored"] = int(days.count)
        out["full"] = int(full)
        out["partial"] = int(partial)
        out["missed"] = int(missed)
        out["items"] = .array(itemJson)
        out["held"] = strings(held)
        out["slipped"] = strings(slipped)
        out["weekly"] = .array(weekly)
        out["earned"] = num(sum(earnedByDay))
        out["floorDays"] = int(earnedByDay.filter { $0 >= data.floor }.count)
        out["slips"] = .array(slipOrder.map { JSON.object(["vice": .string($0), "count": int(slipCounts[$0] ?? 0)]) })
        out["weightChange"] = str(weightChange)
        return WeekLine(json: out, items: lineItems)
    }

    static let changeByKey: [String: String] = [
        "wake": "Phone charges across the room, so the alarm puts your feet on the floor.",
        "workout": "Lay out the gym clothes before bed so the morning workout needs no decisions.",
        "core": "Do core straight after the last set, before you leave the gym floor.",
        "calories": "Log every meal when you eat it, not at night, so the number steers the day.",
        "protein": "Put a protein meal or shake in the first block after the workout, every day.",
        "earned": "Start the first delivery block on time and stay out until the day reads the floor.",
        "study": "Start the study block at its scheduled time with the phone in another room.",
        "business": "Write tomorrow's one business move the night before and do it before noon.",
        "bed": "Set an alarm 30 minutes before bed time. When it goes, screens off.",
    ]

    /// Next week's one change, by rule. The item missed most often, or nothing.
    public static func pickChange(_ week: [WeekItemLine]) -> String {
        let worst = week
            .enumerated()
            .filter { $0.element.hits < $0.element.of }
            .sorted { a, b in
                let ga = a.element.of - a.element.hits
                let gb = b.element.of - b.element.hits
                if ga != gb { return ga > gb }
                return a.offset < b.offset
            }
            .first?.element
        guard let w = worst else { return "Keep the same schedule. Nothing in the data says to change it." }
        if let k = w.key, let line = changeByKey[k] { return line }
        if let k = w.key, k.hasPrefix("vice_") { return "Log each \(T.viceName(w.name)) slip with the time and what set it off, so the pattern shows." }
        return "Give \"\(w.name)\" a fixed time on the schedule every day next week."
    }

    // MARK: yesterday

    static func summaries(_ data: CoachData) -> [DaySummary] {
        guard let range = completedRange(historyStart: data.historyStart, today: data.today) else { return [] }
        let dates = LIDate.dateRange(range.from, range.to).suffix(14)
        return dates.map { Scoring.summarizeDay($0, data.items, data.versions, data.logs) }
    }

    /// Yesterday's line for the check-ins and the snapshot. Nil on the first day of the history.
    public static func yesterdayLine(_ data: CoachData) -> YesterdayLine? {
        let yesterdayDate = LIDate.addDays(data.today, -1)
        guard let ys = summaries(data).first(where: { $0.date == yesterdayDate }) else { return nil }
        let notDone = ys.items.filter { !$0.done }
        // "In bed on time" is ticked the next morning, so open is not a miss yet.
        let pending = notDone.filter { $0.item.key == "bed" && $0.state == .open }
        let misses = notDone.filter { r in !(r.item.key == "bed" && r.state == .open) }
        return YesterdayLine(
            date: ys.date,
            label: LIDate.formatDateLong(ys.date),
            status: ys.status,
            done: ys.done,
            total: ys.total,
            misses: misses.map { missLine($0) },
            pending: pending.map { $0.item.name }
        )
    }

    static func missJson(_ m: MissLine) -> JSON {
        return .object(["key": str(m.key), "name": .string(m.name), "state": .string(m.state), "logged": str(m.logged), "target": .string(m.target), "gap": str(m.gap)])
    }

    static func workoutLine(_ w: Workout?) -> JSON {
        guard let w = w else { return .null }
        return .object([
            "name": .string(w.name),
            "detail": str(w.detail),
            "exercises": strings(w.exercises.map { "\($0.name) \($0.sets) x \($0.reps)" }),
        ])
    }

    // MARK: the snapshot

    /// The whole picture, compact, with every number the coach may use.
    public static func buildSnapshot(_ data: CoachData, weekOf: DateStr? = nil) -> JSONObject {
        let today = data.today
        let historyStart = data.historyStart
        let items = data.items
        let versions = data.versions
        let logs = data.logs
        let phase = today < historyStart ? "before" : "active"
        var running: Challenge? = nil
        if let c = data.challenge, c.status == .active, Challenges.ranOn(c, today) { running = c }
        let weekday = LIDate.weekdayOf(today)
        let unit = data.weightUnit

        let sums = summaries(data)

        // Consistency over the last 30 days is the measure in both modes.
        var statusByDate: [DateStr: DayStatus] = [:]
        if phase == "active" {
            let back = LIDate.addDays(today, -30)
            let first = back < historyStart ? historyStart : back
            for d in LIDate.dateRange(first, today) {
                statusByDate[d] = Scoring.summarizeDay(d, items, versions, logs).status
            }
        }
        let steady = Challenges.consistency(statusByDate, today: today, from: historyStart, window: 30)

        var dayLines: [JSON] = []
        for s in sums {
            var dayNumber: JSON = .null
            if let r = running, Challenges.ranOn(r, s.date) { dayNumber = int(LIDate.dayNumber(r.startDate, s.date)) }
            dayLines.append(.object([
                "date": .string(s.date),
                "label": .string(LIDate.formatDateShort(s.date)),
                "dayNumber": dayNumber,
                "status": .string(s.status.rawValue),
                "done": int(s.done),
                "total": int(s.total),
                "missed": strings(s.items.filter { !$0.done }.map { $0.item.name }),
            ]))
        }

        var yesterdayJson: JSON = .null
        if let y = yesterdayLine(data) {
            yesterdayJson = .object([
                "date": .string(y.date),
                "label": .string(y.label),
                "status": .string(y.status.rawValue),
                "done": int(y.done),
                "total": int(y.total),
                "misses": .array(y.misses.map { missJson($0) }),
                "pending": strings(y.pending),
            ])
        }

        let last7 = sums.suffix(7)
        let itemLines: [JSON] = items
            .enumerated()
            .filter { $0.element.cadence == .daily && phase != "before" && Targets.isActiveOn($0.element, versions, today) }
            .sorted { a, b in
                if a.element.sortOrder != b.element.sortOrder { return a.element.sortOrder < b.element.sortOrder }
                return a.offset < b.offset
            }
            .map { $0.element }
            .map { i in
                let st = Streaks.itemStreak(i, versions, logs, today: today, from: historyStart)
                let rows = last7.compactMap { s in s.items.first(where: { $0.item.id == i.id }) }
                return JSON.object([
                    "key": str(i.key),
                    "name": .string(i.name),
                    "target": .string(Targets.describeTarget(i.target, unit: i.unit)),
                    "streak": int(st.current),
                    "best": int(st.best),
                    "hits7": int(rows.filter { $0.done }.count),
                    "days7": int(rows.count),
                ])
            }

        // Macros: calories and protein are what the checklist scored, carbs and fat come from meals.
        let cal = items.first(where: { $0.key == "calories" })
        let pro = items.first(where: { $0.key == "protein" })
        let macroBack = LIDate.addDays(today, -6)
        let macroFrom = macroBack < historyStart ? historyStart : macroBack
        var macroDays: [JSON] = []
        if phase != "before" {
            for d in LIDate.dateRange(macroFrom, today) {
                let meals = data.meals.filter { $0.date == d }
                func logValue(_ item: ChecklistItem?) -> Double? {
                    guard let item = item else { return nil }
                    return logs.first(where: { $0.date == d && $0.itemId == item.id })?.value
                }
                func mealSum(_ pick: (Meal) -> Double) -> JSON {
                    if meals.isEmpty { return .null }
                    return num(T.jsRound(sum(meals.map(pick))))
                }
                let calories: JSON = logValue(cal).map { num($0) } ?? mealSum({ $0.calories })
                let protein: JSON = logValue(pro).map { num($0) } ?? mealSum({ $0.protein })
                macroDays.append(.object([
                    "date": .string(d),
                    "label": .string(LIDate.formatDateShort(d)),
                    "calories": calories,
                    "protein": protein,
                    "carbs": mealSum({ $0.carbs }),
                    "fat": mealSum({ $0.fat }),
                ]))
            }
        }

        let liftWindow = data.setLogs.filter { $0.date <= today && $0.date >= LIDate.addDays(today, -35) }
        let lifts: [JSON] = topSets(liftWindow, unit: unit)
            .map { entry -> (String, [TopSet]) in (entry.name, Array(entry.sets.suffix(3))) }
            .filter { $0.1.count >= 2 }
            .prefix(8)
            .map { entry in
                JSON.object([
                    "exercise": .string(entry.0),
                    "sessions": .array(entry.1.map { s in
                        JSON.object(["date": .string(s.date), "label": .string(LIDate.formatDateShort(s.date)), "top": .string(s.label)])
                    }),
                ])
            }

        let weights = data.bodyLogs
            .filter { $0.weight != nil && $0.date <= today }
            .sorted { $0.date < $1.date }
        var weightChange: String? = nil
        if weights.count >= 2, let firstLog = weights.first, let lastLog = weights.last {
            let first = firstLog.weight ?? 0
            let last = lastLog.weight ?? 0
            let delta = T.round1(last - first)
            let lastText = T.decimal(last, minFraction: 0, maxFraction: 3)
            if delta == 0 {
                weightChange = "flat at \(lastText) \(unit)"
            } else {
                weightChange = "\(delta < 0 ? "down" : "up") \(T.decimal(abs(delta), minFraction: 0, maxFraction: 3)) \(unit) since \(LIDate.formatDateShort(firstLog.date))"
            }
        }
        let weightEntries: [JSON] = weights.suffix(6).map { b in
            JSON.object(["date": .string(b.date), "label": .string(LIDate.formatDateShort(b.date)), "weight": num(b.weight ?? 0)])
        }

        let slipFrom = LIDate.addDays(today, -14)
        let vices: [JSON] = items
            .enumerated()
            .filter { $0.element.category == .vice && phase != "before" && Targets.isActiveOn($0.element, versions, today) }
            .sorted { a, b in
                if a.element.sortOrder != b.element.sortOrder { return a.element.sortOrder < b.element.sortOrder }
                return a.offset < b.offset
            }
            .map { $0.element }
            .map { i in
                let slips = data.slips
                    .filter { $0.itemId == i.id && $0.date >= slipFrom && $0.date <= today }
                    .sorted { ($0.date + $0.time) < ($1.date + $1.time) }
                    .map { s -> JSON in
                        let trigger = (s.trigger ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                        return JSON.object([
                            "date": .string(s.date),
                            "label": .string(LIDate.formatDateShort(s.date)),
                            "time": .string(LIDate.formatTime(s.time)),
                            "trigger": trigger.isEmpty ? JSON.null : JSON.string(trigger),
                        ])
                    }
                return JSON.object([
                    "name": .string(T.viceName(i.name)),
                    "cleanStreak": int(Streaks.itemStreak(i, versions, logs, today: today, from: historyStart).current),
                    "slips": .array(slips),
                ])
            }

        let main = data.workouts.first(where: { $0.weekday == weekday && $0.slot == .main })
        let core = data.workouts.first(where: { $0.weekday == weekday && $0.slot == .core })
        let focusBack = LIDate.addDays(today, -6)
        let focusFrom = focusBack < historyStart ? historyStart : focusBack
        var focusDays: [JSON] = []
        if phase != "before" {
            for d in LIDate.dateRange(focusFrom, today) {
                let minutes = T.jsRound(sum(data.focus.filter { $0.date == d }.map { Double($0.minutes) }))
                focusDays.append(.object(["date": .string(d), "label": .string(LIDate.formatDateShort(d)), "minutes": num(minutes)]))
            }
        }
        let week = buildWeek(data, anyDateInWeek: weekOf ?? today)

        let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        var todayObj: JSONObject = [:]
        todayObj["date"] = .string(today)
        todayObj["label"] = .string(LIDate.formatDateLong(today))
        todayObj["weekday"] = .string(dayNames[weekday])
        todayObj["mode"] = .string(running != nil ? "challenge" : "ongoing")
        todayObj["challenge"] = str(running?.name)
        todayObj["dayNumber"] = running.map { int(LIDate.dayNumber($0.startDate, today)) } ?? JSON.null
        todayObj["lengthDays"] = running.map { int($0.lengthDays) } ?? JSON.null
        todayObj["daysLeft"] = running.map { int(max(0, LIDate.diffDays(today, Challenges.plannedEnd($0)))) } ?? JSON.null
        todayObj["phase"] = .string(phase)
        todayObj["consistency"] = .object([
            "full": int(steady.full),
            "days": int(steady.days),
            "window": int(steady.window),
            "label": .string(Challenges.consistencyLabel(steady)),
        ])

        let sortedBlocks = data.blocks.enumerated().sorted { a, b in
            if a.element.start != b.element.start { return a.element.start < b.element.start }
            return a.offset < b.offset
        }.map { $0.element }
        var planObj: JSONObject = [:]
        planObj["blocks"] = .array(sortedBlocks.map { b in
            JSON.object(["name": .string(b.blockName), "kind": .string(b.kind), "start": .string(LIDate.formatTime(b.start)), "end": .string(LIDate.formatTime(b.end))])
        })
        planObj["workout"] = workoutLine(main)
        planObj["core"] = workoutLine(core)

        var macrosObj: JSONObject = [:]
        macrosObj["targets"] = .object([
            "calories": cal.map { JSON.string(Targets.describeTarget($0.target, unit: $0.unit)) } ?? JSON.null,
            "protein": pro.map { JSON.string(Targets.describeTarget($0.target, unit: $0.unit)) } ?? JSON.null,
            "carbs": .string("\(T.decimal(data.carbsTarget, minFraction: 0, maxFraction: 3))g"),
            "fat": .string("\(T.decimal(data.fatTarget, minFraction: 0, maxFraction: 3))g"),
        ])
        macrosObj["days"] = .array(macroDays)

        var out: JSONObject = [:]
        out["version"] = int(1)
        out["today"] = .object(todayObj)
        out["plan"] = .object(planObj)
        out["yesterday"] = yesterdayJson
        out["days"] = .array(dayLines)
        out["items"] = .array(itemLines)
        out["money"] = .object(buildMoney(data))
        out["macros"] = .object(macrosObj)
        out["lifts"] = .array(lifts)
        out["weight"] = .object(["unit": .string(unit), "entries": .array(weightEntries), "change": str(weightChange)])
        out["vices"] = .array(vices)
        out["focus"] = .object(["goalMinutes": int(data.focusGoalMinutes), "days": .array(focusDays)])
        out["week"] = .object(week.json)
        out["flags"] = .array([])
        out["suggestedChange"] = .string(pickChange(week.items))
        return out
    }
}
