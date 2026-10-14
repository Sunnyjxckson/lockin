import SwiftUI
import LockInKit

/// One vice: the clean streak, today's control, dollars kept, the calendar, the pattern and the slips.
struct ViceDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    let itemId: String
    let model: VicesModel

    @State private var sheet: VicesSheet? = nil
    @State private var toast: String? = nil

    var body: some View {
        let library = model.library(store)
        let view = library.first(where: { $0.item.id == itemId })
        ZStack(alignment: .bottom) {
            if let view = view {
                content(view)
            } else {
                LIScreen {
                    LIPageHeader("Vices")
                    LICard { LIEmptyState(title: "Not found", message: "This one is no longer in your list.") }
                }
            }
            if let toast = toast {
                Text(toast)
                    .liType(.sub)
                    .foregroundColor(theme.ink)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(theme.surface2))
                    .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
                    .padding(.bottom, 16)
            }
        }
        .viceSheets($sheet, vices: library, model: model, say: say)
    }

    private func say(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            if toast == text { toast = nil }
        }
    }

    private func content(_ view: ViceView) -> some View {
        let item = view.item
        let cal = model.calendar(store, view)
        let pattern = ViceRules.slipPattern(view.slips)
        return LIScreen {
            HStack(alignment: .center) {
                LIPageHeader(item.name, eyebrow: view.rule)
                Spacer()
                Button {
                    LIHaptics.tap()
                    sheet = .vice(item: item)
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 18))
                        .foregroundColor(theme.ink)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(theme.tile))
                }
                .buttonStyle(LIPressStyle())
                .accessibilityLabel("Edit")
            }
            streak(view)
            today(view)
            stats(view, pattern)
            keptLine(view)
            calendarSection(cal)
            patternSection(pattern)
            slipsSection(view)
            if item.active {
                Button {
                    LIHaptics.tap()
                    Task {
                        do {
                            try await store.viceSetActive(item, false, today: store.today)
                            say("Off from today. Past days keep their record.")
                        } catch {
                            say(PlanErrorText.text(error))
                        }
                    }
                } label: {
                    Text("Turn off").liType(.body).foregroundColor(theme.ink2).frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(LIPressStyle())
                .padding(.top, 24)
            }
        }
        .refreshable {
            await store.reload()
            await model.load(store)
        }
    }

    private func streak(_ view: ViceView) -> some View {
        LIBigNumber("\(view.streak.current)", unit: view.streak.current == 1 ? "day" : "days", label: "Clean streak", size: .hero)
            .padding(.top, 4)
    }

    @ViewBuilder
    private func today(_ view: ViceView) -> some View {
        if view.item.active {
            LICard(feature: true) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Today").liType(.label).foregroundColor(theme.ink2)
                    ViceTodayControl(
                        view: view,
                        onSlip: { sheet = .slip(itemId: view.item.id, slip: nil, note: nil) },
                        onAdd: { sheet = .amount(itemId: view.item.id) }
                    )
                }
            }
            .padding(.top, 20)
        } else {
            HStack(spacing: 12) {
                Text("Off. Past days keep their record.").liType(.sub).foregroundColor(theme.ink2)
                Spacer(minLength: 8)
                LISecondaryButton("Turn on") {
                    Task {
                        do {
                            try await store.viceSetActive(view.item, true, today: store.today)
                        } catch {
                            say(PlanErrorText.text(error))
                        }
                    }
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, 8)
            .padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
            .padding(.top, 20)
        }
    }

    private func stats(_ view: ViceView, _ pattern: SlipPattern) -> some View {
        HStack(alignment: .top, spacing: 14) {
            LIStat(label: "Best", value: "\(view.streak.best)d")
            LIStat(label: "Slips", value: "\(pattern.total)")
            if let kept = view.kept {
                LIStat(label: "Kept", value: ViceRules.formatDollars(kept.kept))
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 24)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private func keptLine(_ view: ViceView) -> some View {
        if let kept = view.kept {
            if let spend = view.spend {
                let perDay = (ViceRules.spendPerDay(spend) * 100).rounded() / 100
                let spent = kept.spent > 0 ? ", minus \(ViceRules.formatDollars(kept.spent)) spent" : ""
                Text("\(kept.cleanDays) clean \(kept.cleanDays == 1 ? "day" : "days") at about \(ViceRules.formatDollars(perDay)) a day\(spent).")
                    .liType(.sub).foregroundColor(theme.ink2)
                    .padding(.top, 16)
                    .padding(.horizontal, 4)
            } else {
                HStack(spacing: 12) {
                    Text("Add a typical spend to see dollars kept.").liType(.sub).foregroundColor(theme.ink2)
                    Spacer(minLength: 8)
                    LISecondaryButton("Set spend") { sheet = .vice(item: view.item) }
                }
                .padding(.leading, 16)
                .padding(.trailing, 8)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
                .padding(.top, 20)
            }
        }
    }

    private func calendarSection(_ cal: (window: ViceWindow, days: [ViceDay])) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LISectionLabel(cal.window.name ?? "Last \(cal.window.length) days")
            ViceCalendarGrid(days: cal.days)
        }
        .padding(.top, 28)
    }

    private func patternSection(_ pattern: SlipPattern) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LISectionLabel("Pattern", trailing: pattern.total > 0 ? "\(pattern.total) \(pattern.total == 1 ? "slip" : "slips")" : nil)
            if pattern.total == 0 {
                LICard {
                    LIEmptyState(title: "No slips logged", message: "Log one with the time and what set it off, and the pattern shows here.")
                }
            } else {
                VStack(spacing: 0) {
                    if let t = pattern.timeOfDay {
                        row(viceCap(t.value.rawValue), "Most common time of day", "\(t.count) of \(pattern.total)")
                        LIHairline()
                    }
                    row(pattern.trigger.map { viceCap($0.value) } ?? "None noted", "Most common trigger", pattern.trigger.map { "\($0.count) of \(pattern.total)" })
                    if let d = pattern.weekday {
                        LIHairline()
                        row(ViceRules.weekdayNames[d.value % 7], "Most common day", "\(d.count) of \(pattern.total)")
                    }
                }
                .background(LITileSurface(radius: 20))
            }
        }
        .padding(.top, 28)
    }

    @ViewBuilder
    private func slipsSection(_ view: ViceView) -> some View {
        if !view.slips.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                LISectionLabel("Slips")
                VStack(spacing: 0) {
                    ForEach(Array(view.slips.enumerated()), id: \.element.id) { index, s in
                        if index > 0 { LIHairline() }
                        Button {
                            LIHaptics.tap()
                            sheet = .slip(itemId: nil, slip: s, note: nil)
                        } label: {
                            row(
                                "\(String(ViceRules.weekdayNames[LIDate.weekdayOf(s.date) % 7].prefix(3))), \(LIDate.formatDateShort(s.date)) at \(LIDate.formatTime(s.time))",
                                s.trigger.map { viceCap($0) } ?? "No trigger noted",
                                s.amount.map { ViceRules.formatDollars($0) }
                            )
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
                .background(LITileSurface(radius: 20))
            }
            .padding(.top, 28)
        }
    }

    private func row(_ title: String, _ sub: String, _ right: String?) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                Text(sub).liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
            }
            Spacer(minLength: 8)
            if let right = right { Text(right).liType(.sub).foregroundColor(theme.ink2) }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

/// Clean and slip days over a run of days, Monday first so weekday patterns line up.
struct ViceCalendarGrid: View {
    @Environment(\.liTheme) private var theme
    let days: [ViceDay]

    private static let head = ["M", "T", "W", "T", "F", "S", "S"]

    var body: some View {
        if days.isEmpty {
            EmptyView()
        } else {
            let lead = (LIDate.weekdayOf(days[0].date) + 6) % 7
            let cols = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)
            VStack(alignment: .leading, spacing: 14) {
                LazyVGrid(columns: cols, spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        Text(ViceCalendarGrid.head[i]).liType(.caption).foregroundColor(theme.ink2)
                            .accessibilityHidden(true)
                    }
                    ForEach(0..<lead, id: \.self) { _ in
                        Color.clear.frame(height: 1)
                    }
                    ForEach(days, id: \.date) { d in
                        cell(d)
                    }
                }
                HStack(spacing: 20) {
                    HStack(spacing: 8) {
                        Circle().fill(theme.gradient).frame(width: 10, height: 10)
                        Text("Clean").liType(.caption).foregroundColor(theme.ink2)
                    }
                    HStack(spacing: 8) {
                        Circle().fill(theme.ink2).frame(width: 6, height: 6)
                        Text("Slip").liType(.caption).foregroundColor(theme.ink2)
                    }
                }
            }
        }
    }

    private func label(_ d: ViceDay) -> String {
        switch d.state {
        case .clean: return "clean"
        case .slip: return "slip"
        case .open: return "nothing logged"
        case .off: return "not tracked"
        case .future: return "ahead"
        }
    }

    private func cell(_ d: ViceDay) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous).fill(fill(d))
            if d.isToday && d.state != .clean {
                RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(theme.ink, lineWidth: 1)
            }
            Text("\(d.day)")
                .liType(.sub)
                .foregroundColor(d.state == .clean ? theme.accentInk : (d.state == .off || d.state == .future ? theme.ink3 : theme.ink))
            if d.state == .slip {
                HStack(spacing: 2) {
                    ForEach(0..<min(3, max(1, d.slips)), id: \.self) { _ in
                        Circle().fill(theme.ink2).frame(width: 4, height: 4)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, 5)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(LIDate.formatDateLong(d.date)), \(label(d))")
    }

    private func fill(_ d: ViceDay) -> AnyShapeStyle {
        switch d.state {
        case .clean: return AnyShapeStyle(theme.gradient)
        case .slip, .open: return AnyShapeStyle(theme.tile)
        case .off, .future: return AnyShapeStyle(Color.clear)
        }
    }
}
