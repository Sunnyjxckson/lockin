import XCTest
@testable import LockInKit

var kitCounter = 0

func makeItem(id: String? = nil, name: String? = nil, type: ItemType = .yesno, cadence: Cadence = .daily, target: Target = .check, category: ItemCategory = .habit, key: String? = nil, unit: String? = nil, sortOrder: Int? = nil, active: Bool = true, archived: Bool = false) -> ChecklistItem {
    kitCounter += 1
    return ChecklistItem(
        id: id ?? "item\(kitCounter)",
        createdAt: "2026-10-01T12:00:00.000Z",
        key: key,
        name: name ?? "Item \(kitCounter)",
        type: type,
        cadence: cadence,
        target: target,
        category: category,
        unit: unit,
        sortOrder: sortOrder ?? kitCounter,
        active: active,
        archived: archived
    )
}

func makeLog(_ itemId: String, _ date: String, value: Double? = nil, checked: Bool = false, text: String? = nil, completedAt: String? = nil, slips: Int = 0) -> DayLog {
    kitCounter += 1
    return DayLog(id: "log\(kitCounter)", createdAt: "2026-10-01T12:00:00.000Z", date: date, itemId: itemId, value: value, checked: checked, text: text, completedAt: completedAt, slips: slips)
}

func makeVersion(_ itemId: String, _ from: String, _ target: Target, active: Bool = true) -> TargetVersion {
    kitCounter += 1
    return TargetVersion(id: "ver\(kitCounter)", createdAt: "2026-10-01T12:00:00.000Z", itemId: itemId, effectiveFrom: from, target: target, active: active)
}

/// A ticked log.
func tick(_ itemId: String, _ date: String, _ completedAt: String? = nil) -> DayLog {
    return makeLog(itemId, date, checked: true, completedAt: completedAt)
}

func makeChallenge(id: String = "c1", status: ChallengeStatus = .active, start: String = "2026-10-05", length: Int = 30, endedOn: String? = nil, rules: [ChallengeRule]? = nil, createdAt: String = "2026-10-01T12:00:00.000Z") -> Challenge {
    return Challenge(id: id, createdAt: createdAt, name: "30 day lock in", status: status, startDate: start, lengthDays: length, endedOn: endedOn, rules: rules, restartOf: nil, moneyTarget: 1000, moneyDeadline: "2026-10-14", dailyFloor: 100, moneyTargetStart: nil)
}

func makeEarning(_ date: String, _ amount: Double, hours: Double? = nil) -> Earning {
    kitCounter += 1
    return Earning(id: "e\(kitCounter)", createdAt: "2026-10-01T12:00:00.000Z", date: date, amount: amount, app: "DoorDash", hours: hours)
}

func iso(_ s: String) -> Date {
    return LIDate.parseISO(s) ?? Date(timeIntervalSince1970: 0)
}
