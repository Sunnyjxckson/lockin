import SwiftUI
import UIKit
import Observation
import LockInKit

/// The numbers one Record screen shows, computed once per change in the data.
struct RecordSnap {
    var challenge: ProgressModel?
    var headline: OngoingHeadline
    var weeks: [OngoingWeek]
    var months: [OngoingMonth]
    /// The last 30 days, for the ongoing view.
    var recent: ProgressModel
    var noLogsYet: Bool
}

@Observable
@MainActor
final class RecordModel {
    private(set) var loaded: RecordLoad? = nil
    private(set) var loading = true
    private(set) var error: String? = nil
    var weeksShown = 6
    var monthsShown = 3
    var pastId: String? = nil
    @ObservationIgnored private var cache: (key: Int, snap: RecordSnap)? = nil

    static let weeksStep = 6
    static let monthsStep = 3

    func load(_ store: AppStore) async {
        if !store.hasData { await store.reload() }
        let start = store.mode.historyStart
        do {
            loaded = try await store.recordLoad(from: LIDate.weekStart(start), to: store.today)
            error = nil
        } catch is CancellationError {
            return
        } catch {
            self.error = PlanErrorText.text(error)
        }
        loading = false
    }

    /// Older logs from the full load, then AppStore's own, which are live. So a tick on Today shows here at once.
    private func mergedLogs(_ store: AppStore) -> [DayLog] {
        let live = store.logs
        guard let loaded = loaded else { return live }
        guard let first = live.map({ $0.date }).min() else { return loaded.logs }
        return loaded.logs.filter { $0.date < first } + live
    }

    private func key(_ store: AppStore, _ logs: [DayLog]) -> Int {
        var h = Hasher()
        h.combine(store.today)
        h.combine(store.mode.historyStart)
        h.combine(weeksShown)
        h.combine(monthsShown)
        h.combine(pastId)
        for i in store.items { h.combine(i.id); h.combine(i.active); h.combine(i.archived); h.combine(i.name) }
        for v in store.savedVersions { h.combine(v.id) }
        for c in store.challenges { h.combine(c.id); h.combine(c.status.rawValue); h.combine(c.endedOn) }
        for l in logs { h.combine(l.id); h.combine(l.checked); h.combine(l.value); h.combine(l.slips); h.combine(l.text) }
        return h.finalize()
    }

    func shownChallenge(_ store: AppStore) -> Challenge? {
        if let id = pastId { return store.challenges.first(where: { $0.id == id }) }
        return store.mode.challenge ?? store.mode.finished
    }

    func snap(_ store: AppStore) -> RecordSnap? {
        if loaded == nil { return nil }
        let logs = mergedLogs(store)
        let k = key(store, logs)
        if let c = cache, c.key == k { return c.snap }
        let today = store.today
        let start = store.mode.historyStart
        let items = store.items
        let versions = store.savedVersions
        let index = LogIndex(logs)

        var challengeModel: ProgressModel? = nil
        if let shown = shownChallenge(store) {
            let last = Challenges.lastDay(shown)
            let asOf: DateStr
            if shown.status == .active || last >= today {
                asOf = today
            } else if last < shown.startDate {
                asOf = LIDate.addDays(shown.startDate, -1)
            } else {
                asOf = last
            }
            challengeModel = ProgressRules.buildProgress(ProgressInput(
                startDate: shown.startDate,
                lengthDays: shown.lengthDays,
                streakFrom: start,
                today: asOf,
                items: ChallengeViews.challengeItems(shown, items),
                versions: versions,
                logs: index
            ))
        }

        let input = OngoingInput(historyStart: start, today: today, items: items, versions: versions, logs: index)
        let first30 = LIDate.addDays(today, -29)
        let windowStart = first30 < start ? start : first30
        let recent = ProgressRules.buildProgress(ProgressInput(startDate: windowStart, lengthDays: 30, streakFrom: start, today: today, items: items, versions: versions, logs: index))
        let snap = RecordSnap(
            challenge: challengeModel,
            headline: OngoingRules.headline(OngoingRules.statusByDate(input), historyStart: start, today: today),
            weeks: OngoingRules.weeks(input, max: weeksShown + 1),
            months: OngoingRules.months(input, max: monthsShown + 1),
            recent: recent,
            noLogsYet: logs.isEmpty
        )
        cache = (k, snap)
        return snap
    }

    /// The card for the share sheet: the challenge in play, else the last 30 days.
    func cardData(_ store: AppStore) -> CardData? {
        guard let loaded = loaded else { return nil }
        let logs = mergedLogs(store)
        let today = store.today
        let back = LIDate.addDays(today, -400)
        let hist = store.mode.historyStart
        let streakFrom = hist > back ? hist : back
        let index = LogIndex(logs)
        if let c = store.mode.challenge {
            let model = ProgressRules.buildProgress(ProgressInput(
                startDate: c.startDate,
                lengthDays: c.lengthDays,
                streakFrom: streakFrom,
                today: today,
                items: ChallengeViews.challengeItems(c, store.items),
                versions: store.savedVersions,
                logs: index
            ))
            return ProgressRules.cardData(model, startDate: c.startDate, today: today, bodyLogs: loaded.bodyLogs)
        }
        let input = OngoingInput(historyStart: streakFrom, today: today, items: store.items, versions: store.savedVersions, logs: index)
        return OngoingRules.cardData(input, bodyLogs: loaded.bodyLogs)
    }

    /// A photo for the card. Only http(s) links can be read here: a reference kept inside one browser is not reachable.
    static func loadPhoto(_ ref: String?) async -> UIImage? {
        guard let ref = ref, ref.hasPrefix("http"), let url = URL(string: ref) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        return UIImage(data: data)
    }
}
