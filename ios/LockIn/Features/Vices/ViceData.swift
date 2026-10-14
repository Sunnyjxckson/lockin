import SwiftUI
import Observation
import LockInKit

/// One vice with everything the screens show about it.
struct ViceView: Identifiable {
    let item: ChecklistItem
    /// The rule in force today.
    let target: Target
    let rule: String
    let streak: Streak
    let state: ViceDayState
    let log: DayLog?
    /// Newest first.
    let slips: [ViceSlip]
    let slipsToday: [ViceSlip]
    let spend: TypicalSpend?
    /// Only for money vices.
    let kept: DollarsKept?
    var id: String { return item.id }
}

/// Slips are not part of AppStore, so the Vices screens load them here. Everything else comes from the store.
@Observable
@MainActor
final class VicesModel {
    private(set) var slips: [ViceSlip] = []
    private(set) var loading = true
    var toast: String? = nil

    func load(_ store: AppStore) async {
        do {
            slips = try await store.viceLoadSlips()
        } catch is CancellationError {
            return
        } catch {
            toast = PlanErrorText.text(error)
        }
        loading = false
    }

    /// The vices that are not removed, in checklist order. Streaks count from the start of the ongoing history.
    func library(_ store: AppStore) -> [ViceView] {
        let today = store.today
        let back = LIDate.addDays(today, -400)
        let hist = store.mode.historyStart
        let start = hist > back ? hist : back
        let versions = store.savedVersions
        let logs = store.logs
        return store.items
            .filter { $0.category == .vice && !$0.archived }
            .map { item in
                let mine = ViceRules.sortSlips(slips.filter { $0.itemId == item.id && $0.date >= start && $0.date <= today })
                let log = logs.first(where: { $0.itemId == item.id && $0.date == today })
                let todays = mine.filter { $0.date == today }
                let target = Targets.targetOn(item, versions, today)
                let spend = ViceRules.spendOf(item)
                var kept: DollarsKept? = nil
                if item.tracksMoney {
                    let clean = ViceRules.cleanDayCount(item, versions, logs, mine, from: start, today: today)
                    kept = ViceRules.dollarsKept(cleanDays: clean, spend: spend, slipAmounts: mine.map { $0.amount })
                }
                return ViceView(
                    item: item,
                    target: target,
                    rule: ViceRules.describeRule(item, target),
                    streak: ViceRules.viceStreak(item, versions, logs, mine, today: today, from: start),
                    state: ViceRules.viceDayState(item, versions, log, todays.count, date: today, today: today),
                    log: log,
                    slips: mine,
                    slipsToday: todays,
                    spend: spend,
                    kept: kept
                )
            }
    }

    func calendar(_ store: AppStore, _ view: ViceView) -> (window: ViceWindow, days: [ViceDay]) {
        let w = ViceRules.dayWindow(challenge: store.mode.challenge, historyStart: store.mode.historyStart, today: store.today, ongoingDays: 35)
        let days = ViceRules.viceCalendar(view.item, store.savedVersions, store.logs, view.slips, startDate: w.start, lengthDays: w.length, today: store.today, numbered: w.numbered)
        return (w, days)
    }
}

/// Which sheet is open on a Vices screen.
enum VicesSheet: Identifiable {
    case slip(itemId: String?, slip: ViceSlip?, note: String?)
    case amount(itemId: String)
    case vice(item: ChecklistItem?)

    var id: String {
        switch self {
        case .slip(let itemId, let slip, _): return "slip.\(slip?.id ?? itemId ?? "any")"
        case .amount(let itemId): return "amount.\(itemId)"
        case .vice(let item): return "vice.\(item?.id ?? "new")"
        }
    }
}

func viceCap(_ s: String) -> String {
    return s.prefix(1).uppercased() + s.dropFirst()
}
