import SwiftUI
import LockInKit

struct MoneyView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        MoneyScreen(store: store)
    }
}

private enum MoneySheet: Identifiable {
    case add(Data?)
    case edit(Earning)
    case target

    var id: String {
        switch self {
        case .add: return "add"
        case .edit(let e): return "edit-" + e.id
        case .target: return "target"
        }
    }
}

struct MoneyScreen: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase

    @State private var model: MoneyModel
    @State private var sheet: MoneySheet? = nil
    @State private var toast: String? = nil
    @State private var camera = false
    @State private var library = false

    init(store: AppStore) {
        _model = State(initialValue: MoneyModel(store: store))
    }

    var body: some View {
        ZStack {
            if store.hasData {
                content
            } else {
                firstLoad
            }
        }
        .task {
            if !store.hasData { await store.reload() }
            await model.load()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
        .onChange(of: store.today) { _, _ in
            Task { await model.load() }
        }
    }

    @ViewBuilder
    private var firstLoad: some View {
        ZStack {
            LIBackground()
            switch store.loadState {
            case .failed(let message, let offline):
                LIEmptyState(
                    title: offline ? "You look offline" : "Could not load",
                    message: offline ? "Lock In needs the server for the first load." : message,
                    actionTitle: "Try again",
                    action: { Task { await store.reload() } }
                )
                .padding(.horizontal, 20)
            case .loaded:
                LIEmptyState(title: "Nothing set up yet", message: "Open Lock In on the web once, then pull down here.")
                    .padding(.horizontal, 20)
            default:
                ProgressView().tint(theme.ink2)
            }
        }
    }

    // MARK: content

    private var content: some View {
        LIScreen {
            header
            if let error = model.loadError {
                LINotice(error, actionTitle: "Retry") { Task { await model.load() } }
                    .padding(.bottom, 8)
            }
            hero
                .padding(.top, 12)
            todayCard
                .padding(.top, 22)
            statsRow
                .padding(.top, 24)
            groceries
            history
                .padding(.top, 8)
        }
        .refreshable {
            await model.load()
            await store.reload()
        }
        .mbToast($toast)
        .mbPhotoSources(camera: $camera, library: $library, maxSize: 1400) { data in
            sheet = .add(data)
        }
        .sheet(item: $sheet) { current in
            sheetBody(current)
        }
    }

    private var status: String {
        if !model.hasTarget { return "Floor \(Money.formatMoney(model.floor))" }
        switch model.state {
        case .hit: return "Target hit"
        case .past: return "Deadline passed"
        case .active:
            let n = model.daysLeft
            if n == 0 { return "Due today" }
            return "\(n) \(n == 1 ? "day" : "days") left"
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Money").liType(.title).foregroundColor(theme.ink)
            Spacer()
            Text(status)
                .liType(.sub)
                .foregroundColor(model.hasTarget && model.state == .hit ? theme.accent : theme.ink2)
        }
        .padding(.top, 16)
        .padding(.bottom, 4)
    }

    /// The amount without its dollar sign, so the sign can be drawn small beside it.
    private func bare(_ n: Double) -> String {
        return String(Money.formatMoney(n).dropFirst())
    }

    // MARK: hero

    @ViewBuilder
    private var hero: some View {
        if model.hasTarget {
            targetHero
        } else {
            ongoingHero
        }
    }

    private var targetSub: String {
        let deadline = LIDate.formatDateShort(model.deadline)
        let needed = model.needed
        switch model.state {
        case .hit:
            return "\(Money.formatMoney(model.total - model.target)) over. Due \(deadline)."
        case .past:
            return "\(Money.formatMoney(needed.remaining)) short on \(deadline)."
        case .active:
            var line = "\(Money.formatMoney(needed.remaining)) to go by \(deadline)."
            if let perDay = needed.perDay {
                line += " \(Money.formatMoney(perDay.rounded(.up))) a day gets you there."
            }
            return line
        }
    }

    private var targetHero: some View {
        VStack(alignment: .leading, spacing: 12) {
            LIBigNumber(bare(model.total), prefix: "$", label: "Toward \(Money.formatMoney(model.target))")
            Text(targetSub).liType(.sub).foregroundColor(theme.ink2)
            LIProgressBar(value: model.progress, height: 4)
                .padding(.top, 4)
            if model.wasReset {
                Text("Counting from \(LIDate.formatDateShort(model.since)). All time \(Money.formatMoney(model.allTime)).")
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
            }
            if Money.canResetTarget(model.state) {
                LISecondaryButton("Set a new target") { sheet = .target }
                    .padding(.top, 6)
            }
        }
    }

    private var ongoingHero: some View {
        VStack(alignment: .leading, spacing: 12) {
            LIBigNumber(bare(model.allTime), prefix: "$", label: "Earned so far")
            if model.challenge != nil {
                Text("This challenge has no money target. The daily floor still counts.")
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
                LISecondaryButton("Set a target") { sheet = .target }
                    .padding(.top, 6)
            } else {
                Text("Since \(LIDate.formatDateShort(model.historyStart)). A target comes with a challenge, which you start in Settings. The floor counts every day.")
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
            }
        }
    }

    // MARK: today

    private var todayCard: some View {
        let f = model.todayFloor
        let met = f.met && f.earned > 0
        return LICard(feature: true) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Today").liType(.label).foregroundColor(theme.ink2)
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(Money.formatMoney(f.earned)).liType(.h1).foregroundColor(theme.ink)
                            Text("of \(Money.formatMoney(f.floor))").liType(.sub).foregroundColor(theme.ink2)
                        }
                    }
                    Spacer(minLength: 8)
                    HStack(spacing: 10) {
                        MBPhotoMenu(camera: $camera, library: $library) {
                            MBCircleLabel(systemName: "camera")
                        }
                        .accessibilityLabel("Read a screenshot")
                        MBCircleButton(systemName: "plus", filled: true, label: "Add earnings") {
                            sheet = .add(nil)
                        }
                    }
                }
                LIProgressBar(value: f.progress, height: 4)
                HStack(spacing: 6) {
                    if met {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(theme.accent)
                    }
                    Text(todayLine(f, met: met)).liType(.sub).foregroundColor(theme.ink2)
                }
            }
        }
    }

    private func todayLine(_ f: FloorStatus, met: Bool) -> String {
        if met {
            return f.over > 0 ? "Floor met. \(Money.formatMoney(f.over)) over, banked." : "Floor met."
        }
        var line = "\(Money.formatMoney(f.short)) to go."
        if model.banked > 0 { line += " Being ahead does not lower it." }
        return line
    }

    // MARK: stats and groceries

    private var statsRow: some View {
        let rate = model.rateOverall
        return HStack(alignment: .top, spacing: 14) {
            LIStat(label: "Per hour", value: rate != nil ? Money.formatMoney(rate ?? 0) : "$0")
                .frame(maxWidth: .infinity, alignment: .leading)
            LIStat(label: "Banked", value: Money.formatMoney(model.banked.rounded()))
                .frame(maxWidth: .infinity, alignment: .leading)
            LIStat(label: "Worked", value: Money.formatHours((model.hoursWorked * 10).rounded() / 10))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private var groceries: some View {
        if model.groceriesThisWeek > 0 {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Groceries this week").liType(.body).foregroundColor(theme.ink)
                    Text("Money out, from the meal plan").liType(.caption).foregroundColor(theme.ink2)
                }
                Spacer(minLength: 8)
                Text(Money.formatMoney(model.groceriesThisWeek)).liType(.value).foregroundColor(theme.ink)
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 64)
            .background(LITileSurface(radius: 20))
            .padding(.top, 24)
        }
    }

    // MARK: history

    private func dayLabel(_ date: DateStr) -> String {
        if date == store.today { return "Today" }
        if date == LIDate.addDays(store.today, -1) { return "Yesterday" }
        return LIDate.formatDateLong(date)
    }

    @ViewBuilder
    private var history: some View {
        if !model.loaded {
            EmptyView()
        } else if model.days.isEmpty {
            LIEmptyState(
                title: "No earnings yet",
                message: "Add a shift in a few taps, or read it off a screenshot of the earnings screen.",
                actionTitle: "Add earnings",
                action: { sheet = .add(nil) }
            )
            .padding(.top, 16)
        } else {
            ForEach(model.days) { day in
                daySection(day)
                    .padding(.top, 26)
            }
        }
    }

    private func daySection(_ day: MoneyDay) -> some View {
        let s = Money.floorStatus(earned: day.total, floor: model.floor)
        let locked = model.isLocked(day.date)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(dayLabel(day.date)).liType(.label).foregroundColor(theme.ink2)
                Spacer()
                if locked {
                    Image(systemName: "lock")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundColor(theme.ink3)
                }
                if s.met {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(theme.accent)
                }
                Text(Money.formatMoney(day.total))
                    .liType(.sub)
                    .foregroundColor(s.met ? theme.accent : theme.ink)
                if let rate = day.rate {
                    Text("\(Money.formatMoney(rate.rounded()))/h").liType(.caption).foregroundColor(theme.ink2)
                }
            }
            .padding(.horizontal, 4)
            MBList {
                ForEach(0..<day.entries.count, id: \.self) { i in
                    let e = day.entries[i]
                    if i > 0 { LIHairline() }
                    MBRow(
                        title: e.app.isEmpty ? "Other" : e.app,
                        sub: entrySub(e),
                        value: Money.formatMoney(e.amount),
                        right: (e.screenshotUrl ?? "").isEmpty ? nil : AnyView(
                            Image(systemName: "photo")
                                .font(.system(size: 13, weight: .regular))
                                .foregroundColor(theme.ink3)
                        ),
                        action: { sheet = .edit(e) }
                    )
                }
            }
        }
    }

    private func entrySub(_ e: Earning) -> String {
        if let h = e.hours, h > 0 {
            return "\(Money.formatHours(h)), \(Money.formatMoney((e.amount / h).rounded()))/h"
        }
        return "No hours logged"
    }

    // MARK: sheets

    @ViewBuilder
    private func sheetBody(_ current: MoneySheet) -> some View {
        switch current {
        case .add(let data):
            MoneyEarningSheet(
                model: model,
                editing: nil,
                prefill: data,
                today: store.today,
                defaultApp: model.lastApp,
                isLocked: { model.isLocked($0) },
                onClose: { message in finish(message) }
            )
            .liSheetStyle()
            .presentationDetents([.large])
        case .edit(let earning):
            MoneyEarningSheet(
                model: model,
                editing: earning,
                prefill: nil,
                today: store.today,
                defaultApp: model.lastApp,
                isLocked: { model.isLocked($0) },
                onClose: { message in finish(message) }
            )
            .liSheetStyle()
            .presentationDetents([.large])
        case .target:
            if let c = model.challenge {
                MoneyTargetSheet(
                    model: model,
                    challenge: c,
                    floor: model.floor,
                    earnedToday: model.todayFloor.earned,
                    allTime: model.allTime,
                    today: store.today,
                    onClose: { message in finish(message) }
                )
                .liSheetStyle()
                .presentationDetents([.large])
            }
        }
    }

    private func finish(_ message: String?) {
        sheet = nil
        if let message = message { toast = message }
    }
}
