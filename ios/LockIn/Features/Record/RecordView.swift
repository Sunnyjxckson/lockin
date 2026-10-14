import SwiftUI
import LockInKit

struct RecordView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase

    @State private var model = RecordModel()
    @State private var openCell: OpenCell? = nil
    @State private var perspective: Perspective = .weeks
    @State private var showShare = false

    enum Perspective: Hashable { case weeks, months }

    struct OpenCell: Identifiable {
        let cell: ProgressCell
        let dated: Bool
        var id: String { return cell.date }
    }

    var body: some View {
        Group {
            if !store.hasData || model.loading {
                ZStack {
                    LIBackground()
                    if case .failed(let message, let offline) = store.loadState, !store.hasData {
                        LIEmptyState(title: offline ? "You look offline" : "Could not load", message: message, actionTitle: "Try again") {
                            Task { await model.load(store) }
                        }
                        .padding(.horizontal, 20)
                    } else if let error = model.error, !model.loading {
                        LIEmptyState(title: "Could not load", message: error, actionTitle: "Try again") {
                            Task { await model.load(store) }
                        }
                        .padding(.horizontal, 20)
                    } else {
                        ProgressView().tint(theme.ink2)
                    }
                }
            } else if let snap = model.snap(store) {
                screen(snap)
            } else {
                ZStack {
                    LIBackground()
                    LIEmptyState(title: "Could not load", message: model.error, actionTitle: "Try again") {
                        Task { await model.load(store) }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
        .task { await model.load(store) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load(store) } }
        }
        .sheet(item: $openCell) { open in
            RecordDaySheet(cell: open.cell, title: open.dated ? LIDate.formatDateShort(open.cell.date) : nil)
                .liSheetStyle()
        }
        .sheet(isPresented: $showShare) {
            RecordShareSheet(model: model)
        }
    }

    // MARK: screen

    @ViewBuilder
    private func screen(_ snap: RecordSnap) -> some View {
        if let viewing = model.pastId.flatMap({ id in store.challenges.first(where: { $0.id == id }) }), let cm = snap.challenge {
            LIScreen {
                pastChallenge(viewing, cm)
            }
            .refreshable { await refresh() }
        } else {
            LIScreen {
                main(snap)
            }
            .refreshable { await refresh() }
        }
    }

    private func refresh() async {
        await store.reload()
        await model.load(store)
    }

    private func headerRow(status: String) -> some View {
        HStack(alignment: .center, spacing: 8) {
            LIPageHeader("Record")
            Spacer()
            Text(status).liType(.sub).foregroundColor(theme.ink2)
            Button {
                LIHaptics.tap()
                showShare = true
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 18))
                    .foregroundColor(theme.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(theme.tile))
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Share card")
        }
    }

    @ViewBuilder
    private func main(_ snap: RecordSnap) -> some View {
        let mode = store.mode
        let inPlay = mode.challenge ?? mode.finished
        let h = snap.challenge?.headline
        let inChallenge = inPlay != nil && snap.challenge != nil && h != nil
        let streaks = inChallenge ? (snap.challenge?.streaks ?? []) : snap.recent.streaks
        let rates = inChallenge ? (snap.challenge?.rates ?? []) : snap.recent.rates
        let streakIds = Set(streaks.map { $0.item.id })
        let otherRates = rates.filter { !streakIds.contains($0.item.id) }
        let c = snap.headline.last30
        let status: String = {
            if inChallenge, let h = h {
                if mode.finished != nil { return "Ready to close" }
                return h.finished ? "Done" : "\(ProgressRules.countLabel(h.remaining, .day)) left"
            }
            return "Ongoing"
        }()

        headerRow(status: status)
        if inChallenge, let cm = snap.challenge, let h = h, let play = inPlay {
            VStack(alignment: .leading, spacing: 16) {
                LIBigNumber("\(h.day)", unit: "of \(h.length)", label: "\(play.name), \(h.finished ? "done" : "day")")
                Text(snap.noLogsYet ? "Nothing logged yet. Tick things off on Today." : "\(h.percent)% of everything done so far.")
                    .liType(.sub).foregroundColor(theme.ink2)
                LIProgressBar(value: Double(h.percent) / 100)
            }
            .padding(.top, 12)
            RecordGrid(grid: cm.grid) { cell in openCell = OpenCell(cell: cell, dated: false) }
                .padding(.top, 28)
            statRow([
                ("Locked in", "\(h.lockedIn)"),
                ("Partial", "\(h.partial)"),
                ("Missed", "\(h.missed)"),
                ("Left", "\(h.remaining)"),
            ]).padding(.top, 28)
            section("Ongoing", trailing: "Never resets") {
                ongoingStats(snap.headline, withWindow: true)
            }
        } else {
            VStack(alignment: .leading, spacing: 16) {
                LIBigNumber("\(c.full)", unit: "of \(c.days)", label: c.days < c.window ? "Days locked in" : "Last \(c.window) days")
                Text(consistencyLine(snap, c)).liType(.sub).foregroundColor(theme.ink2)
                LIProgressBar(value: c.days > 0 ? Double(c.full) / Double(c.days) : 0)
            }
            .padding(.top, 12)
            ongoingStats(snap.headline, withWindow: false).padding(.top, 28)
            overTime(snap)
        }

        section("Streaks", trailing: "Slipping first") {
            streaksList(streaks, rates)
        }
        if !otherRates.isEmpty {
            section("Removed items", trailing: inChallenge ? "This challenge" : "Last 30 days") {
                RecordRates(rows: otherRates)
            }
        }
        if inChallenge, let cm = snap.challenge {
            let weeks = cm.weeks.filter { $0.state != .future }.reversed()
            if !weeks.isEmpty {
                section("Challenge weeks", trailing: nil) {
                    VStack(spacing: 0) {
                        ForEach(Array(weeks.enumerated()), id: \.element.weekStart) { index, w in
                            if index > 0 { LIHairline() }
                            RecordWeekRow(week: w, grid: cm.grid).padding(.vertical, 16)
                        }
                    }
                }
            }
            overTime(snap)
        }
        pastList
        section("Weekly review", trailing: nil) {
            RecordWeeklyReview(note: model.loaded?.weeklyNote, today: store.today)
        }
    }

    private func consistencyLine(_ snap: RecordSnap, _ c: Consistency) -> String {
        if let up = store.mode.upcoming {
            return "\(up.name) starts \(LIDate.formatDateShort(up.startDate)), to \(LIDate.formatDateShort(Challenges.plannedEnd(up)))."
        }
        if snap.noLogsYet { return "Nothing logged yet. Tick things off on Today." }
        if c.days == 0 { return "Today is the first day." }
        return "\(c.percent)% of days were full."
    }

    private func section<Content: View>(_ title: String, trailing: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LISectionLabel(title, trailing: trailing)
            content()
        }
        .padding(.top, 32)
    }

    private func statRow(_ items: [(String, String)]) -> some View {
        HStack(alignment: .top, spacing: 14) {
            ForEach(0..<items.count, id: \.self) { i in
                LIStat(label: items[i].0, value: items[i].1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 4)
    }

    private func ongoingStats(_ h: OngoingHeadline, withWindow: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if withWindow {
                Text(h.last30.days == 0 ? "Today is the first day." : "\(Challenges.consistencyLabel(h.last30)) were full.")
                    .liType(.sub).foregroundColor(theme.ink2)
                    .padding(.horizontal, 4)
            }
            statRow([
                ("Last 7", h.last7.days > 0 ? "\(h.last7.full)/\(h.last7.days)" : "0"),
                ("In a row", "\(h.fullStreak)"),
                ("Best run", "\(h.bestFullStreak)"),
                ("All time", "\(h.fullDays)"),
            ])
        }
    }

    // MARK: over time

    private func overTime(_ snap: RecordSnap) -> some View {
        let weeks = Array(snap.weeks.prefix(model.weeksShown))
        let months = Array(snap.months.prefix(model.monthsShown))
        let more = perspective == .weeks ? snap.weeks.count > model.weeksShown : snap.months.count > model.monthsShown
        return section("Over time", trailing: ProgressRules.countLabel(snap.headline.totalDays, .day)) {
            VStack(alignment: .leading, spacing: 20) {
                LISegmentedControl(options: [(value: Perspective.weeks, title: "Weeks"), (value: Perspective.months, title: "Months")], selection: $perspective)
                if perspective == .weeks {
                    ForEach(weeks, id: \.weekStart) { w in
                        RecordOngoingWeek(week: w) { cell in openCell = OpenCell(cell: cell, dated: true) }
                    }
                } else {
                    ForEach(months, id: \.key) { m in
                        RecordOngoingMonth(month: m) { cell in openCell = OpenCell(cell: cell, dated: true) }
                    }
                }
                if more {
                    LISecondaryButton("Show earlier \(perspective == .weeks ? "weeks" : "months")") {
                        if perspective == .weeks { model.weeksShown += RecordModel.weeksStep } else { model.monthsShown += RecordModel.monthsStep }
                    }
                }
            }
        }
    }

    // MARK: streaks

    @ViewBuilder
    private func streaksList(_ rows: [StreakRow], _ rates: [ItemRate]) -> some View {
        if rows.isEmpty {
            LICard { LIEmptyState(title: "Nothing in the checklist", message: "Add items in Settings and their streaks show up here.") }
        } else {
            let rateOf = Dictionary(rates.map { ($0.item.id, $0) }, uniquingKeysWith: { first, _ in first })
            VStack(spacing: 0) {
                ForEach(rows, id: \.item.id) { r in
                    RecordStreakRow(row: r, rate: rateOf[r.item.id])
                }
            }
        }
    }

    // MARK: past challenges

    @ViewBuilder
    private var pastList: some View {
        let past = ChallengeViews.pastChallenges(store.challenges)
        if !past.isEmpty {
            section("Past challenges", trailing: "\(past.count)") {
                VStack(spacing: 0) {
                    ForEach(Array(past.enumerated()), id: \.element.id) { index, p in
                        if index > 0 { LIHairline() }
                        let ran = ChallengeViews.daysRun(p, today: store.today)
                        Button {
                            LIHaptics.tap()
                            model.pastId = p.id
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                                    Text(pastSub(p, ran)).liType(.caption).foregroundColor(theme.ink2).lineLimit(2)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.ink3)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 60)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
                .background(LITileSurface(radius: 20))
            }
        }
    }

    private func pastSub(_ p: Challenge, _ ran: Int) -> String {
        let status = ChallengeViews.statusLabel(p.status)
        if ran > 0 {
            return "\(status), \(LIDate.formatDateShort(p.startDate)) to \(LIDate.formatDateShort(Challenges.lastDay(p))), \(ProgressRules.countLabel(ran, .day))"
        }
        return "\(status), never ran a day"
    }

    @ViewBuilder
    private func pastChallenge(_ c: Challenge, _ cm: ProgressModel) -> some View {
        let h = cm.headline
        let ran = ChallengeViews.daysRun(c, today: store.today)
        Button {
            LIHaptics.tap()
            model.pastId = nil
        } label: {
            Label("Back to record", systemImage: "chevron.left")
                .liType(.sub)
                .foregroundColor(theme.ink2)
                .frame(minHeight: 44)
        }
        .buttonStyle(LIPressStyle())
        LIPageHeader(
            c.name,
            eyebrow: "Past challenge, \(ChallengeViews.statusLabel(c.status))",
            subtitle: ran > 0
                ? "\(LIDate.formatDateShort(c.startDate)) to \(LIDate.formatDateShort(Challenges.lastDay(c))), \(ran) of \(c.lengthDays) days"
                : "Set for \(LIDate.formatDateShort(c.startDate)). It never ran a day."
        )
        if ran > 0 {
            statRow([("Locked in", "\(h.lockedIn)"), ("Partial", "\(h.partial)"), ("Missed", "\(h.missed)")])
                .padding(.top, 12)
            section("\(cm.grid.length) days", trailing: nil) {
                RecordGrid(grid: cm.grid) { cell in openCell = OpenCell(cell: cell, dated: false) }
            }
            if !cm.rates.isEmpty {
                section("Completion by item", trailing: "Lowest first") {
                    RecordRates(rows: cm.rates)
                }
            }
        }
        Text("These days stay in your ongoing history.").liType(.sub).foregroundColor(theme.ink2).padding(.top, 28)
    }
}
