// Generated from src/lib/types.ts. One struct per table the phone can reach.
import Foundation

public struct Challenge: DBRow, Equatable, Identifiable {
    public static let table = "challenge"
    public var id: String = ""
    public var createdAt: String = ""
    public var name: String = ""
    public var status: ChallengeStatus = .active
    public var startDate: String = ""
    public var lengthDays: Int = 1
    public var endedOn: String? = nil
    public var rules: [ChallengeRule]? = nil
    public var restartOf: String? = nil
    public var moneyTarget: Double? = nil
    public var moneyDeadline: String? = nil
    public var dailyFloor: Double = 0
    public var moneyTargetStart: String? = nil
    public init(id: String = "", createdAt: String = "", name: String = "", status: ChallengeStatus = .active, startDate: String = "", lengthDays: Int = 1, endedOn: String? = nil, rules: [ChallengeRule]? = nil, restartOf: String? = nil, moneyTarget: Double? = nil, moneyDeadline: String? = nil, dailyFloor: Double = 0, moneyTargetStart: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.name = name
        self.status = status
        self.startDate = startDate
        self.lengthDays = lengthDays
        self.endedOn = endedOn
        self.rules = rules
        self.restartOf = restartOf
        self.moneyTarget = moneyTarget
        self.moneyDeadline = moneyDeadline
        self.dailyFloor = dailyFloor
        self.moneyTargetStart = moneyTargetStart
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", name, status, startDate = "start_date", lengthDays = "length_days", endedOn = "ended_on", rules, restartOf = "restart_of", moneyTarget = "money_target", moneyDeadline = "money_deadline", dailyFloor = "daily_floor", moneyTargetStart = "money_target_start"
    }
}

extension Challenge {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        name = c.or(.name, "")
        status = c.or(.status, .active)
        startDate = c.or(.startDate, "")
        lengthDays = c.or(.lengthDays, 1)
        endedOn = c.opt(.endedOn)
        rules = c.opt(.rules)
        restartOf = c.opt(.restartOf)
        moneyTarget = c.opt(.moneyTarget)
        moneyDeadline = c.opt(.moneyDeadline)
        dailyFloor = c.or(.dailyFloor, 0)
        moneyTargetStart = c.opt(.moneyTargetStart)
    }
}

public struct ChecklistItem: DBRow, Equatable, Identifiable {
    public static let table = "checklist_item"
    public var id: String = ""
    public var createdAt: String = ""
    public var key: String? = nil
    public var name: String = ""
    public var type: ItemType = .yesno
    public var cadence: Cadence = .daily
    public var target: Target = .check
    public var category: ItemCategory = .habit
    public var mode: ViceMode? = nil
    public var unit: String? = nil
    public var hint: String? = nil
    public var sortOrder: Int = 0
    public var track: Track? = nil
    public var active: Bool = true
    public var archived: Bool = false
    public var weeklyDay: Int? = nil
    public var withPhoto: Bool = false
    public var tracksMoney: Bool = false
    public var typicalSpend: Double? = nil
    public var spendPeriod: SpendPeriod? = nil
    public init(id: String = "", createdAt: String = "", key: String? = nil, name: String = "", type: ItemType = .yesno, cadence: Cadence = .daily, target: Target = .check, category: ItemCategory = .habit, mode: ViceMode? = nil, unit: String? = nil, hint: String? = nil, sortOrder: Int = 0, track: Track? = nil, active: Bool = true, archived: Bool = false, weeklyDay: Int? = nil, withPhoto: Bool = false, tracksMoney: Bool = false, typicalSpend: Double? = nil, spendPeriod: SpendPeriod? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.key = key
        self.name = name
        self.type = type
        self.cadence = cadence
        self.target = target
        self.category = category
        self.mode = mode
        self.unit = unit
        self.hint = hint
        self.sortOrder = sortOrder
        self.track = track
        self.active = active
        self.archived = archived
        self.weeklyDay = weeklyDay
        self.withPhoto = withPhoto
        self.tracksMoney = tracksMoney
        self.typicalSpend = typicalSpend
        self.spendPeriod = spendPeriod
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", key, name, type, cadence, target, category, mode, unit, hint, sortOrder = "sort_order", track, active, archived, weeklyDay = "weekly_day", withPhoto = "with_photo", tracksMoney = "tracks_money", typicalSpend = "typical_spend", spendPeriod = "spend_period"
    }
}

extension ChecklistItem {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        key = c.opt(.key)
        name = c.or(.name, "")
        type = c.or(.type, .yesno)
        cadence = c.or(.cadence, .daily)
        target = c.or(.target, .check)
        category = c.or(.category, .habit)
        mode = c.opt(.mode)
        unit = c.opt(.unit)
        hint = c.opt(.hint)
        sortOrder = c.or(.sortOrder, 0)
        track = c.opt(.track)
        active = c.or(.active, true)
        archived = c.or(.archived, false)
        weeklyDay = c.opt(.weeklyDay)
        withPhoto = c.or(.withPhoto, false)
        tracksMoney = c.or(.tracksMoney, false)
        typicalSpend = c.opt(.typicalSpend)
        spendPeriod = c.opt(.spendPeriod)
    }
}

public struct TargetVersion: DBRow, Equatable, Identifiable {
    public static let table = "target_version"
    public var id: String = ""
    public var createdAt: String = ""
    public var itemId: String = ""
    public var effectiveFrom: String = ""
    public var target: Target = .check
    public var active: Bool = true
    public init(id: String = "", createdAt: String = "", itemId: String = "", effectiveFrom: String = "", target: Target = .check, active: Bool = true) {
        self.id = id
        self.createdAt = createdAt
        self.itemId = itemId
        self.effectiveFrom = effectiveFrom
        self.target = target
        self.active = active
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", itemId = "item_id", effectiveFrom = "effective_from", target, active
    }
}

extension TargetVersion {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        itemId = c.or(.itemId, "")
        effectiveFrom = c.or(.effectiveFrom, "")
        target = c.or(.target, .check)
        active = c.or(.active, true)
    }
}

public struct DayLog: DBRow, Equatable, Identifiable {
    public static let table = "day_log"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var itemId: String = ""
    public var value: Double? = nil
    public var checked: Bool = false
    public var text: String? = nil
    public var completedAt: String? = nil
    public var slips: Int = 0
    public init(id: String = "", createdAt: String = "", date: String = "", itemId: String = "", value: Double? = nil, checked: Bool = false, text: String? = nil, completedAt: String? = nil, slips: Int = 0) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.itemId = itemId
        self.value = value
        self.checked = checked
        self.text = text
        self.completedAt = completedAt
        self.slips = slips
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, itemId = "item_id", value, checked, text, completedAt = "completed_at", slips
    }
}

extension DayLog {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        itemId = c.or(.itemId, "")
        value = c.opt(.value)
        checked = c.or(.checked, false)
        text = c.opt(.text)
        completedAt = c.opt(.completedAt)
        slips = c.or(.slips, 0)
    }
}

public struct ViceSlip: DBRow, Equatable, Identifiable {
    public static let table = "vice_slip"
    public var id: String = ""
    public var createdAt: String = ""
    public var itemId: String = ""
    public var date: String = ""
    public var time: String = ""
    public var trigger: String? = nil
    public var amount: Double? = nil
    public init(id: String = "", createdAt: String = "", itemId: String = "", date: String = "", time: String = "", trigger: String? = nil, amount: Double? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.itemId = itemId
        self.date = date
        self.time = time
        self.trigger = trigger
        self.amount = amount
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", itemId = "item_id", date, time, trigger, amount
    }
}

extension ViceSlip {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        itemId = c.or(.itemId, "")
        date = c.or(.date, "")
        time = c.or(.time, "")
        trigger = c.opt(.trigger)
        amount = c.opt(.amount)
    }
}

public struct ScheduleTemplate: DBRow, Equatable, Identifiable {
    public static let table = "schedule_template"
    public var id: String = ""
    public var createdAt: String = ""
    public var weekday: Int = 0
    public var blockName: String = ""
    public var start: String = ""
    public var end: String = ""
    public var kind: BlockKind = .wake
    public var flexible: Bool = false
    public var note: String? = nil
    public init(id: String = "", createdAt: String = "", weekday: Int = 0, blockName: String = "", start: String = "", end: String = "", kind: BlockKind = .wake, flexible: Bool = false, note: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.weekday = weekday
        self.blockName = blockName
        self.start = start
        self.end = end
        self.kind = kind
        self.flexible = flexible
        self.note = note
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", weekday, blockName = "block_name", start, end, kind, flexible, note
    }
}

extension ScheduleTemplate {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        weekday = c.or(.weekday, 0)
        blockName = c.or(.blockName, "")
        start = c.or(.start, "")
        end = c.or(.end, "")
        kind = c.or(.kind, .wake)
        flexible = c.or(.flexible, false)
        note = c.opt(.note)
    }
}

public struct ScheduleBlock: DBRow, Equatable, Identifiable {
    public static let table = "schedule_block"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var blockName: String = ""
    public var start: String = ""
    public var end: String = ""
    public var duration: Int = 0
    public var flexible: Bool = false
    public var kind: BlockKind = .wake
    public var note: String? = nil
    public var calendarEventId: String? = nil
    public var templateId: String? = nil
    public var source: BlockSource = .template
    public init(id: String = "", createdAt: String = "", date: String = "", blockName: String = "", start: String = "", end: String = "", duration: Int = 0, flexible: Bool = false, kind: BlockKind = .wake, note: String? = nil, calendarEventId: String? = nil, templateId: String? = nil, source: BlockSource = .template) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.blockName = blockName
        self.start = start
        self.end = end
        self.duration = duration
        self.flexible = flexible
        self.kind = kind
        self.note = note
        self.calendarEventId = calendarEventId
        self.templateId = templateId
        self.source = source
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, blockName = "block_name", start, end, duration, flexible, kind, note, calendarEventId = "calendar_event_id", templateId = "template_id", source
    }
}

extension ScheduleBlock {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        blockName = c.or(.blockName, "")
        start = c.or(.start, "")
        end = c.or(.end, "")
        duration = c.or(.duration, 0)
        flexible = c.or(.flexible, false)
        kind = c.or(.kind, .wake)
        note = c.opt(.note)
        calendarEventId = c.opt(.calendarEventId)
        templateId = c.opt(.templateId)
        source = c.or(.source, .template)
    }
}

public struct Earning: DBRow, Equatable, Identifiable {
    public static let table = "earning"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var amount: Double = 0
    public var app: String = ""
    public var hours: Double? = nil
    public var screenshotUrl: String? = nil
    public init(id: String = "", createdAt: String = "", date: String = "", amount: Double = 0, app: String = "", hours: Double? = nil, screenshotUrl: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.amount = amount
        self.app = app
        self.hours = hours
        self.screenshotUrl = screenshotUrl
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, amount, app, hours, screenshotUrl = "screenshot_url"
    }
}

extension Earning {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        amount = c.or(.amount, 0)
        app = c.or(.app, "")
        hours = c.opt(.hours)
        screenshotUrl = c.opt(.screenshotUrl)
    }
}

public struct Meal: DBRow, Equatable, Identifiable {
    public static let table = "meal"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var time: String = ""
    public var name: String? = nil
    public var photoUrl: String? = nil
    public var calories: Double = 0
    public var protein: Double = 0
    public var carbs: Double = 0
    public var fat: Double = 0
    public init(id: String = "", createdAt: String = "", date: String = "", time: String = "", name: String? = nil, photoUrl: String? = nil, calories: Double = 0, protein: Double = 0, carbs: Double = 0, fat: Double = 0) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.time = time
        self.name = name
        self.photoUrl = photoUrl
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, time, name, photoUrl = "photo_url", calories, protein, carbs, fat
    }
}

extension Meal {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        time = c.or(.time, "")
        name = c.opt(.name)
        photoUrl = c.opt(.photoUrl)
        calories = c.or(.calories, 0)
        protein = c.or(.protein, 0)
        carbs = c.or(.carbs, 0)
        fat = c.or(.fat, 0)
    }
}

public struct SavedMeal: DBRow, Equatable, Identifiable {
    public static let table = "saved_meal"
    public var id: String = ""
    public var createdAt: String = ""
    public var name: String = ""
    public var photoUrl: String? = nil
    public var calories: Double = 0
    public var protein: Double = 0
    public var carbs: Double = 0
    public var fat: Double = 0
    public var useCount: Int = 0
    public init(id: String = "", createdAt: String = "", name: String = "", photoUrl: String? = nil, calories: Double = 0, protein: Double = 0, carbs: Double = 0, fat: Double = 0, useCount: Int = 0) {
        self.id = id
        self.createdAt = createdAt
        self.name = name
        self.photoUrl = photoUrl
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.useCount = useCount
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", name, photoUrl = "photo_url", calories, protein, carbs, fat, useCount = "use_count"
    }
}

extension SavedMeal {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        name = c.or(.name, "")
        photoUrl = c.opt(.photoUrl)
        calories = c.or(.calories, 0)
        protein = c.or(.protein, 0)
        carbs = c.or(.carbs, 0)
        fat = c.or(.fat, 0)
        useCount = c.or(.useCount, 0)
    }
}

public struct BodyLog: DBRow, Equatable, Identifiable {
    public static let table = "body_log"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var weight: Double? = nil
    public var photoUrl: String? = nil
    public init(id: String = "", createdAt: String = "", date: String = "", weight: Double? = nil, photoUrl: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.weight = weight
        self.photoUrl = photoUrl
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, weight, photoUrl = "photo_url"
    }
}

extension BodyLog {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        weight = c.opt(.weight)
        photoUrl = c.opt(.photoUrl)
    }
}

public struct Workout: DBRow, Equatable, Identifiable {
    public static let table = "workout"
    public var id: String = ""
    public var createdAt: String = ""
    public var weekday: Int = 0
    public var slot: WorkoutSlot = .main
    public var name: String = ""
    public var kind: WorkoutKind = .lift
    public var detail: String? = nil
    public var exercises: [Exercise] = []
    public init(id: String = "", createdAt: String = "", weekday: Int = 0, slot: WorkoutSlot = .main, name: String = "", kind: WorkoutKind = .lift, detail: String? = nil, exercises: [Exercise] = []) {
        self.id = id
        self.createdAt = createdAt
        self.weekday = weekday
        self.slot = slot
        self.name = name
        self.kind = kind
        self.detail = detail
        self.exercises = exercises
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", weekday, slot, name, kind, detail, exercises
    }
}

extension Workout {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        weekday = c.or(.weekday, 0)
        slot = c.or(.slot, .main)
        name = c.or(.name, "")
        kind = c.or(.kind, .lift)
        detail = c.opt(.detail)
        exercises = c.or(.exercises, [])
    }
}

public struct SetLog: DBRow, Equatable, Identifiable {
    public static let table = "set_log"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var exercise: String = ""
    public var setNumber: Int = 0
    public var weight: Double? = nil
    public var reps: Int? = nil
    public init(id: String = "", createdAt: String = "", date: String = "", exercise: String = "", setNumber: Int = 0, weight: Double? = nil, reps: Int? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.exercise = exercise
        self.setNumber = setNumber
        self.weight = weight
        self.reps = reps
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, exercise, setNumber = "set_number", weight, reps
    }
}

extension SetLog {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        exercise = c.or(.exercise, "")
        setNumber = c.or(.setNumber, 0)
        weight = c.opt(.weight)
        reps = c.opt(.reps)
    }
}

public struct Reminder: DBRow, Equatable, Identifiable {
    public static let table = "reminder"
    public var id: String = ""
    public var createdAt: String = ""
    public var kind: ReminderKind = .wake
    public var label: String = ""
    public var body: String? = nil
    public var time: String? = nil
    public var blockName: String? = nil
    public var itemId: String? = nil
    public var offsetMinutes: Int = 0
    public var enabled: Bool = true
    public var sortOrder: Int = 0
    public init(id: String = "", createdAt: String = "", kind: ReminderKind = .wake, label: String = "", body: String? = nil, time: String? = nil, blockName: String? = nil, itemId: String? = nil, offsetMinutes: Int = 0, enabled: Bool = true, sortOrder: Int = 0) {
        self.id = id
        self.createdAt = createdAt
        self.kind = kind
        self.label = label
        self.body = body
        self.time = time
        self.blockName = blockName
        self.itemId = itemId
        self.offsetMinutes = offsetMinutes
        self.enabled = enabled
        self.sortOrder = sortOrder
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", kind, label, body, time, blockName = "block_name", itemId = "item_id", offsetMinutes = "offset_minutes", enabled, sortOrder = "sort_order"
    }
}

extension Reminder {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        kind = c.or(.kind, .wake)
        label = c.or(.label, "")
        body = c.opt(.body)
        time = c.opt(.time)
        blockName = c.opt(.blockName)
        itemId = c.opt(.itemId)
        offsetMinutes = c.or(.offsetMinutes, 0)
        enabled = c.or(.enabled, true)
        sortOrder = c.or(.sortOrder, 0)
    }
}

public struct CoachNote: DBRow, Equatable, Identifiable {
    public static let table = "coach_note"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var kind: CoachNoteKind = .morning
    public var body: String = ""
    public var source: NoteSource = .ai
    public var basis: String? = nil
    public init(id: String = "", createdAt: String = "", date: String = "", kind: CoachNoteKind = .morning, body: String = "", source: NoteSource = .ai, basis: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.kind = kind
        self.body = body
        self.source = source
        self.basis = basis
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, kind, body, source, basis
    }
}

extension CoachNote {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        kind = c.or(.kind, .morning)
        body = c.or(.body, "")
        source = c.or(.source, .ai)
        basis = c.opt(.basis)
    }
}

public struct CoachMessage: DBRow, Equatable, Identifiable {
    public static let table = "coach_message"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var sentAt: String = ""
    public var sender: CoachSender = .me
    public var body: String = ""
    public var trigger: CoachTrigger = .chat
    public var source: NoteSource? = nil
    public var quote: String? = nil
    public var checkKey: String? = nil
    public var read: Bool = true
    public init(id: String = "", createdAt: String = "", date: String = "", sentAt: String = "", sender: CoachSender = .me, body: String = "", trigger: CoachTrigger = .chat, source: NoteSource? = nil, quote: String? = nil, checkKey: String? = nil, read: Bool = true) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.sentAt = sentAt
        self.sender = sender
        self.body = body
        self.trigger = trigger
        self.source = source
        self.quote = quote
        self.checkKey = checkKey
        self.read = read
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, sentAt = "sent_at", sender, body, trigger, source, quote, checkKey = "check_key", read
    }
}

extension CoachMessage {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        sentAt = c.or(.sentAt, "")
        sender = c.or(.sender, .me)
        body = c.or(.body, "")
        trigger = c.or(.trigger, .chat)
        source = c.opt(.source)
        quote = c.opt(.quote)
        checkKey = c.opt(.checkKey)
        read = c.or(.read, true)
    }
}

public struct QuoteState: DBRow, Equatable, Identifiable {
    public static let table = "quote_state"
    public var id: String = ""
    public var createdAt: String = ""
    public var quoteId: String = ""
    public var writer: String = ""
    public var work: String = ""
    public var readAt: String? = nil
    public var savedAt: String? = nil
    public var note: String? = nil
    public init(id: String = "", createdAt: String = "", quoteId: String = "", writer: String = "", work: String = "", readAt: String? = nil, savedAt: String? = nil, note: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.quoteId = quoteId
        self.writer = writer
        self.work = work
        self.readAt = readAt
        self.savedAt = savedAt
        self.note = note
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", quoteId = "quote_id", writer, work, readAt = "read_at", savedAt = "saved_at", note
    }
}

extension QuoteState {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        quoteId = c.or(.quoteId, "")
        writer = c.or(.writer, "")
        work = c.or(.work, "")
        readAt = c.opt(.readAt)
        savedAt = c.opt(.savedAt)
        note = c.opt(.note)
    }
}

public struct AppSettings: DBRow, Equatable, Identifiable {
    public static let table = "app_settings"
    public var id: String = ""
    public var createdAt: String = ""
    public var seeded: Bool = false
    public var timezone: String = "America/New_York"
    public var quietStart: String = "22:00"
    public var quietEnd: String = "07:00"
    public var carbsTarget: Double = 0
    public var fatTarget: Double = 0
    public var weightUnit: WeightUnit = .lb
    public var haptics: Bool = true
    public var historyStart: String = ""
    public var dailyFloor: Double = 0
    public var weeklyFoodBudget: Double? = nil
    public var foodLikes: [String] = []
    public var foodDislikes: [String] = []
    public var focusGoalMinutes: Int = 60
    public var businessGoal: String? = nil
    public var preferredStore: String? = nil
    public var displayName: String? = nil
    public var coachVoice: CoachVoice = .stoic
    public var coachCheckins: CoachCheckins = CoachCheckins()
    public var libraryPosition: LibraryPosition? = nil
    public var dropsEnabled: Bool = false
    public var dropsPerDay: Int = 3
    public init(id: String = "", createdAt: String = "", seeded: Bool = false, timezone: String = "America/New_York", quietStart: String = "22:00", quietEnd: String = "07:00", carbsTarget: Double = 0, fatTarget: Double = 0, weightUnit: WeightUnit = .lb, haptics: Bool = true, historyStart: String = "", dailyFloor: Double = 0, weeklyFoodBudget: Double? = nil, foodLikes: [String] = [], foodDislikes: [String] = [], focusGoalMinutes: Int = 60, businessGoal: String? = nil, preferredStore: String? = nil, displayName: String? = nil, coachVoice: CoachVoice = .stoic, coachCheckins: CoachCheckins = CoachCheckins(), libraryPosition: LibraryPosition? = nil, dropsEnabled: Bool = false, dropsPerDay: Int = 3) {
        self.id = id
        self.createdAt = createdAt
        self.seeded = seeded
        self.timezone = timezone
        self.quietStart = quietStart
        self.quietEnd = quietEnd
        self.carbsTarget = carbsTarget
        self.fatTarget = fatTarget
        self.weightUnit = weightUnit
        self.haptics = haptics
        self.historyStart = historyStart
        self.dailyFloor = dailyFloor
        self.weeklyFoodBudget = weeklyFoodBudget
        self.foodLikes = foodLikes
        self.foodDislikes = foodDislikes
        self.focusGoalMinutes = focusGoalMinutes
        self.businessGoal = businessGoal
        self.preferredStore = preferredStore
        self.displayName = displayName
        self.coachVoice = coachVoice
        self.coachCheckins = coachCheckins
        self.libraryPosition = libraryPosition
        self.dropsEnabled = dropsEnabled
        self.dropsPerDay = dropsPerDay
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", seeded, timezone, quietStart = "quiet_start", quietEnd = "quiet_end", carbsTarget = "carbs_target", fatTarget = "fat_target", weightUnit = "weight_unit", haptics, historyStart = "history_start", dailyFloor = "daily_floor", weeklyFoodBudget = "weekly_food_budget", foodLikes = "food_likes", foodDislikes = "food_dislikes", focusGoalMinutes = "focus_goal_minutes", businessGoal = "business_goal", preferredStore = "preferred_store", displayName = "display_name", coachVoice = "coach_voice", coachCheckins = "coach_checkins", libraryPosition = "library_position", dropsEnabled = "drops_enabled", dropsPerDay = "drops_per_day"
    }
}

extension AppSettings {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        seeded = c.or(.seeded, false)
        timezone = c.or(.timezone, "America/New_York")
        quietStart = c.or(.quietStart, "22:00")
        quietEnd = c.or(.quietEnd, "07:00")
        carbsTarget = c.or(.carbsTarget, 0)
        fatTarget = c.or(.fatTarget, 0)
        weightUnit = c.or(.weightUnit, .lb)
        haptics = c.or(.haptics, true)
        historyStart = c.or(.historyStart, "")
        dailyFloor = c.or(.dailyFloor, 0)
        weeklyFoodBudget = c.opt(.weeklyFoodBudget)
        foodLikes = c.or(.foodLikes, [])
        foodDislikes = c.or(.foodDislikes, [])
        focusGoalMinutes = c.or(.focusGoalMinutes, 60)
        businessGoal = c.opt(.businessGoal)
        preferredStore = c.opt(.preferredStore)
        displayName = c.opt(.displayName)
        coachVoice = c.or(.coachVoice, .stoic)
        coachCheckins = c.or(.coachCheckins, CoachCheckins())
        libraryPosition = c.opt(.libraryPosition)
        dropsEnabled = c.or(.dropsEnabled, false)
        dropsPerDay = c.or(.dropsPerDay, 3)
    }
}

public struct MoodLog: DBRow, Equatable, Identifiable {
    public static let table = "mood_log"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var time: String = ""
    public var mood: Int = 3
    public var note: String? = nil
    public init(id: String = "", createdAt: String = "", date: String = "", time: String = "", mood: Int = 3, note: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.time = time
        self.mood = mood
        self.note = note
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, time, mood, note
    }
}

extension MoodLog {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        time = c.or(.time, "")
        mood = c.or(.mood, 3)
        note = c.opt(.note)
    }
}

public struct Motivation: DBRow, Equatable, Identifiable {
    public static let table = "motivation"
    public var id: String = ""
    public var createdAt: String = ""
    public var kind: MotivationKind = .quote
    public var body: String = ""
    public var url: String? = nil
    public var sortOrder: Int = 0
    public init(id: String = "", createdAt: String = "", kind: MotivationKind = .quote, body: String = "", url: String? = nil, sortOrder: Int = 0) {
        self.id = id
        self.createdAt = createdAt
        self.kind = kind
        self.body = body
        self.url = url
        self.sortOrder = sortOrder
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", kind, body, url, sortOrder = "sort_order"
    }
}

extension Motivation {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        kind = c.or(.kind, .quote)
        body = c.or(.body, "")
        url = c.opt(.url)
        sortOrder = c.or(.sortOrder, 0)
    }
}

public struct Board: DBRow, Equatable, Identifiable {
    public static let table = "board"
    public var id: String = ""
    public var createdAt: String = ""
    public var name: String = ""
    public var kind: BoardKind = .body
    public var coverItemId: String? = nil
    public var sortOrder: Int = 0
    public init(id: String = "", createdAt: String = "", name: String = "", kind: BoardKind = .body, coverItemId: String? = nil, sortOrder: Int = 0) {
        self.id = id
        self.createdAt = createdAt
        self.name = name
        self.kind = kind
        self.coverItemId = coverItemId
        self.sortOrder = sortOrder
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", name, kind, coverItemId = "cover_item_id", sortOrder = "sort_order"
    }
}

extension Board {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        name = c.or(.name, "")
        kind = c.or(.kind, .body)
        coverItemId = c.opt(.coverItemId)
        sortOrder = c.or(.sortOrder, 0)
    }
}

public struct BoardItem: DBRow, Equatable, Identifiable {
    public static let table = "board_item"
    public var id: String = ""
    public var createdAt: String = ""
    public var boardId: String = ""
    public var kind: BoardItemKind = .image
    public var imageUrl: String? = nil
    public var note: String? = nil
    public var color: String? = nil
    public var palette: [String]? = nil
    public var source: BoardItemSource? = nil
    public var sourceUrl: String? = nil
    public var aspect: Double? = nil
    public var sortOrder: Int = 0
    public init(id: String = "", createdAt: String = "", boardId: String = "", kind: BoardItemKind = .image, imageUrl: String? = nil, note: String? = nil, color: String? = nil, palette: [String]? = nil, source: BoardItemSource? = nil, sourceUrl: String? = nil, aspect: Double? = nil, sortOrder: Int = 0) {
        self.id = id
        self.createdAt = createdAt
        self.boardId = boardId
        self.kind = kind
        self.imageUrl = imageUrl
        self.note = note
        self.color = color
        self.palette = palette
        self.source = source
        self.sourceUrl = sourceUrl
        self.aspect = aspect
        self.sortOrder = sortOrder
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", boardId = "board_id", kind, imageUrl = "image_url", note, color, palette, source, sourceUrl = "source_url", aspect, sortOrder = "sort_order"
    }
}

extension BoardItem {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        boardId = c.or(.boardId, "")
        kind = c.or(.kind, .image)
        imageUrl = c.opt(.imageUrl)
        note = c.opt(.note)
        color = c.opt(.color)
        palette = c.opt(.palette)
        source = c.opt(.source)
        sourceUrl = c.opt(.sourceUrl)
        aspect = c.opt(.aspect)
        sortOrder = c.or(.sortOrder, 0)
    }
}

public struct ThemeRow: DBRow, Equatable, Identifiable {
    public static let table = "theme"
    public var id: String = ""
    public var createdAt: String = ""
    public var name: String? = nil
    public var base: ThemeBase = .dark
    public var palette: ThemePalette? = nil
    public var accent: String? = nil
    public var boardId: String? = nil
    public var active: Bool = false
    public init(id: String = "", createdAt: String = "", name: String? = nil, base: ThemeBase = .dark, palette: ThemePalette? = nil, accent: String? = nil, boardId: String? = nil, active: Bool = false) {
        self.id = id
        self.createdAt = createdAt
        self.name = name
        self.base = base
        self.palette = palette
        self.accent = accent
        self.boardId = boardId
        self.active = active
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", name, base, palette, accent, boardId = "board_id", active
    }
}

extension ThemeRow {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        name = c.opt(.name)
        base = c.or(.base, .dark)
        palette = c.opt(.palette)
        accent = c.opt(.accent)
        boardId = c.opt(.boardId)
        active = c.or(.active, false)
    }
}

public struct Recipe: DBRow, Equatable, Identifiable {
    public static let table = "recipe"
    public var id: String = ""
    public var createdAt: String = ""
    public var name: String = ""
    public var slot: MealSlot = .breakfast
    public var ingredients: [Ingredient] = []
    public var steps: [String] = []
    public var servings: Double = 1
    public var calories: Double = 0
    public var protein: Double = 0
    public var carbs: Double = 0
    public var fat: Double = 0
    public var estCost: Double = 0
    public var tags: [String] = []
    public var photoUrl: String? = nil
    public var source: RecipeSource = .seed
    public init(id: String = "", createdAt: String = "", name: String = "", slot: MealSlot = .breakfast, ingredients: [Ingredient] = [], steps: [String] = [], servings: Double = 1, calories: Double = 0, protein: Double = 0, carbs: Double = 0, fat: Double = 0, estCost: Double = 0, tags: [String] = [], photoUrl: String? = nil, source: RecipeSource = .seed) {
        self.id = id
        self.createdAt = createdAt
        self.name = name
        self.slot = slot
        self.ingredients = ingredients
        self.steps = steps
        self.servings = servings
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.estCost = estCost
        self.tags = tags
        self.photoUrl = photoUrl
        self.source = source
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", name, slot, ingredients, steps, servings, calories, protein, carbs, fat, estCost = "est_cost", tags, photoUrl = "photo_url", source
    }
}

extension Recipe {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        name = c.or(.name, "")
        slot = c.or(.slot, .breakfast)
        ingredients = c.or(.ingredients, [])
        steps = c.or(.steps, [])
        servings = c.or(.servings, 1)
        calories = c.or(.calories, 0)
        protein = c.or(.protein, 0)
        carbs = c.or(.carbs, 0)
        fat = c.or(.fat, 0)
        estCost = c.or(.estCost, 0)
        tags = c.or(.tags, [])
        photoUrl = c.opt(.photoUrl)
        source = c.or(.source, .seed)
    }
}

public struct MealPlan: DBRow, Equatable, Identifiable {
    public static let table = "meal_plan"
    public var id: String = ""
    public var createdAt: String = ""
    public var weekStart: String = ""
    public var budget: Double = 0
    public var recipeIds: [String] = []
    public var meals: [PlannedMeal] = []
    public var totalCost: Double = 0
    public var store: String? = nil
    public init(id: String = "", createdAt: String = "", weekStart: String = "", budget: Double = 0, recipeIds: [String] = [], meals: [PlannedMeal] = [], totalCost: Double = 0, store: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.weekStart = weekStart
        self.budget = budget
        self.recipeIds = recipeIds
        self.meals = meals
        self.totalCost = totalCost
        self.store = store
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", weekStart = "week_start", budget, recipeIds = "recipe_ids", meals, totalCost = "total_cost", store
    }
}

extension MealPlan {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        weekStart = c.or(.weekStart, "")
        budget = c.or(.budget, 0)
        recipeIds = c.or(.recipeIds, [])
        meals = c.or(.meals, [])
        totalCost = c.or(.totalCost, 0)
        store = c.opt(.store)
    }
}

public struct GroceryItem: DBRow, Equatable, Identifiable {
    public static let table = "grocery_item"
    public var id: String = ""
    public var createdAt: String = ""
    public var planId: String = ""
    public var name: String = ""
    public var quantity: Double = 1
    public var unit: String? = nil
    public var category: String? = nil
    public var store: String? = nil
    public var price: Double? = nil
    public var prices: [String: Double]? = nil
    public var bought: Bool = false
    public init(id: String = "", createdAt: String = "", planId: String = "", name: String = "", quantity: Double = 1, unit: String? = nil, category: String? = nil, store: String? = nil, price: Double? = nil, prices: [String: Double]? = nil, bought: Bool = false) {
        self.id = id
        self.createdAt = createdAt
        self.planId = planId
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.category = category
        self.store = store
        self.price = price
        self.prices = prices
        self.bought = bought
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", planId = "plan_id", name, quantity, unit, category, store, price, prices, bought
    }
}

extension GroceryItem {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        planId = c.or(.planId, "")
        name = c.or(.name, "")
        quantity = c.or(.quantity, 1)
        unit = c.opt(.unit)
        category = c.opt(.category)
        store = c.opt(.store)
        price = c.opt(.price)
        prices = c.opt(.prices)
        bought = c.or(.bought, false)
    }
}

public struct PantryItem: DBRow, Equatable, Identifiable {
    public static let table = "pantry_item"
    public var id: String = ""
    public var createdAt: String = ""
    public var name: String = ""
    public init(id: String = "", createdAt: String = "", name: String = "") {
        self.id = id
        self.createdAt = createdAt
        self.name = name
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", name
    }
}

extension PantryItem {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        name = c.or(.name, "")
    }
}

public struct ReceiptPrice: DBRow, Equatable, Identifiable {
    public static let table = "receipt_price"
    public var id: String = ""
    public var createdAt: String = ""
    public var name: String = ""
    public var store: String = ""
    public var price: Double = 0
    public init(id: String = "", createdAt: String = "", name: String = "", store: String = "", price: Double = 0) {
        self.id = id
        self.createdAt = createdAt
        self.name = name
        self.store = store
        self.price = price
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", name, store, price
    }
}

extension ReceiptPrice {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        name = c.or(.name, "")
        store = c.or(.store, "")
        price = c.or(.price, 0)
    }
}

public struct Expense: DBRow, Equatable, Identifiable {
    public static let table = "expense"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var amount: Double = 0
    public var category: String = ""
    public var note: String? = nil
    public var store: String? = nil
    public var planId: String? = nil
    public init(id: String = "", createdAt: String = "", date: String = "", amount: Double = 0, category: String = "", note: String? = nil, store: String? = nil, planId: String? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.amount = amount
        self.category = category
        self.note = note
        self.store = store
        self.planId = planId
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, amount, category, note, store, planId = "plan_id"
    }
}

extension Expense {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        amount = c.or(.amount, 0)
        category = c.or(.category, "")
        note = c.opt(.note)
        store = c.opt(.store)
        planId = c.opt(.planId)
    }
}

public struct FocusSession: DBRow, Equatable, Identifiable {
    public static let table = "focus_session"
    public var id: String = ""
    public var createdAt: String = ""
    public var date: String = ""
    public var start: String = ""
    public var end: String? = nil
    public var minutes: Int = 0
    public var label: String? = nil
    public var source: SessionSource = .timer
    public var blockId: String? = nil
    public var awayCount: Int = 0
    public var awayMinutes: Int = 0
    public var clockMinutes: Int? = nil
    public var plannedMinutes: Int? = nil
    public var completed: Bool = false
    public var live: FocusLive? = nil
    public init(id: String = "", createdAt: String = "", date: String = "", start: String = "", end: String? = nil, minutes: Int = 0, label: String? = nil, source: SessionSource = .timer, blockId: String? = nil, awayCount: Int = 0, awayMinutes: Int = 0, clockMinutes: Int? = nil, plannedMinutes: Int? = nil, completed: Bool = false, live: FocusLive? = nil) {
        self.id = id
        self.createdAt = createdAt
        self.date = date
        self.start = start
        self.end = end
        self.minutes = minutes
        self.label = label
        self.source = source
        self.blockId = blockId
        self.awayCount = awayCount
        self.awayMinutes = awayMinutes
        self.clockMinutes = clockMinutes
        self.plannedMinutes = plannedMinutes
        self.completed = completed
        self.live = live
    }
    public enum CodingKeys: String, CodingKey {
        case id, createdAt = "created_at", date, start, end, minutes, label, source, blockId = "block_id", awayCount = "away_count", awayMinutes = "away_minutes", clockMinutes = "clock_minutes", plannedMinutes = "planned_minutes", completed, live
    }
}

extension FocusSession {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.or(.id, "")
        createdAt = c.or(.createdAt, "")
        date = c.or(.date, "")
        start = c.or(.start, "")
        end = c.opt(.end)
        minutes = c.or(.minutes, 0)
        label = c.opt(.label)
        source = c.or(.source, .timer)
        blockId = c.opt(.blockId)
        awayCount = c.or(.awayCount, 0)
        awayMinutes = c.or(.awayMinutes, 0)
        clockMinutes = c.opt(.clockMinutes)
        plannedMinutes = c.opt(.plannedMinutes)
        completed = c.or(.completed, false)
        live = c.opt(.live)
    }
}

public enum Tables {
    /// Every table /api/db accepts.
    public static let all: [String] = ["challenge", "checklist_item", "target_version", "day_log", "vice_slip", "schedule_template", "schedule_block", "earning", "meal", "saved_meal", "body_log", "workout", "set_log", "reminder", "coach_note", "coach_message", "quote_state", "app_settings", "mood_log", "motivation", "board", "board_item", "theme", "recipe", "meal_plan", "grocery_item", "pantry_item", "receipt_price", "expense", "focus_session"]
    /// Tables only the server may touch. /api/db answers 403 for these, so the phone has no model for them.
    public static let serverOnly: [String] = ["calendar_token", "push_subscription", "reminder_sent", "reminder_run", "login_attempt"]
}
