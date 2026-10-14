import SwiftUI
import LockInKit

struct PlanView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase

    @State private var model = PlanModel()
    @State private var calendar = PlanCalendarModel()
    @State private var openId: String? = nil
    @State private var adding: PlanAddRequest? = nil
    @State private var confirmReset = false
    @State private var showTemplate = false
    @State private var dismissTask: Task<Void, Never>? = nil
    @State private var epoch = Date()

    var body: some View {
        // A slow clock runs all the time. A one second clock joins in only while a free time block is live.
        let counting = isCounting
        TimelineView(.periodic(from: epoch, by: counting ? 1 : 20)) { context in
            content(now: context.date)
        }
        .task {
            model.bind(store)
            calendar.bind(store)
            if !store.hasData { await store.reload() }
            await model.load(today: store.today)
            await calendar.refresh()
            if await calendar.syncIfStale() { await model.load(today: store.today) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task {
                    await model.load(today: store.today)
                    if await calendar.syncIfStale() { await model.load(today: store.today) }
                }
            }
        }
        .onChange(of: model.toast) { _, toast in
            guard let toast = toast else { return }
            dismissTask?.cancel()
            dismissTask = Task {
                try? await Task.sleep(nanoseconds: 2_600_000_000)
                if !Task.isCancelled && model.toast?.id == toast.id { model.toast = nil }
            }
        }
        .sheet(item: $adding) { request in
            PlanAddSheet(date: model.date, blocks: model.blocks, nowMin: nowMinutes(Date()), startAt: request.at) { block in
                model.commit(PlanRules.addBlock(model.blocks, block), result: nil, done: "\(block.blockName), \(LIDate.formatTime(block.start)) to \(LIDate.formatTime(block.end))", today: store.today)
            }
            .liSheetStyle()
        }
        .sheet(isPresented: Binding(get: { openBlock != nil }, set: { if !$0 { openId = nil } })) {
            if let block = openBlock {
                PlanBlockSheet(
                    block: block,
                    blocks: model.blocks,
                    live: isLive(block),
                    locked: block.source == .calendar && calendar.status?.importWritable == false,
                    onSave: { result in
                        model.commit(result.blocks, result: result, done: "Saved", today: store.today)
                    },
                    onDelete: { b in
                        model.commit(PlanRules.removeBlock(model.blocks, id: b.id), result: nil, done: "\(b.blockName) removed", today: store.today)
                    },
                    onStillGoing: { b in
                        model.stillGoing(b, nowMin: nowMinutes(Date()) ?? 0, today: store.today)
                    }
                )
                .liSheetStyle()
            }
        }
        .sheet(isPresented: $showTemplate) {
            PlanTemplateEditor(initial: model.template, startWeekday: LIDate.weekdayOf(model.date)) {
                Task { await model.load(today: store.today) }
            }
            .liSheetStyle()
        }
        .sheet(isPresented: $confirmReset) {
            resetSheet.liSheetStyle()
        }
    }

    // MARK: clock

    private var isCounting: Bool {
        guard model.date == store.today else { return false }
        let s = nowSeconds(Date())
        guard let f = PlanRules.freeTimeFocus(model.blocks, nowSeconds: s, cleared: model.cleared) else { return false }
        return f.timer.phase == .live
    }

    private func nowSeconds(_ date: Date) -> Int {
        let p = LIDate.nyParts(date)
        let seconds = Int(date.timeIntervalSince1970.truncatingRemainder(dividingBy: 60))
        return p.minutes * 60 + max(0, seconds)
    }

    private func nowMinutes(_ date: Date) -> Int? {
        return model.date == store.today ? LIDate.nyParts(date).minutes : nil
    }

    private var openBlock: DayBlock? {
        guard let id = openId else { return nil }
        return model.blocks.first(where: { $0.id == id })
    }

    private func isLive(_ block: DayBlock) -> Bool {
        guard model.date == store.today else { return false }
        return PlanRules.timerState(block, nowSeconds: nowSeconds(Date())).phase == .live
    }

    // MARK: content

    @ViewBuilder
    private func content(now: Date) -> some View {
        let today = LIDate.todayNY(now)
        let isToday = model.date == today
        let seconds: Int? = isToday ? nowSeconds(now) : nil
        let blocks = model.blocks
        let issues = CalendarRules.dayIssues(blocks)
        let flagged = Set(issues.flatMap { $0.key.split(separator: "|").map(String.init) })
        ZStack(alignment: .bottom) {
            LIScreen {
                header(today: today, isToday: isToday)
                PlanWeekStrip(dates: model.dates(today: today), selected: model.date, today: today, edited: model.editedDates) { picked in
                    model.select(picked, today: today)
                }
                .padding(.top, 4)
                dayTitle(isToday: isToday)
                if isToday, let s = seconds, !model.loading, !blocks.isEmpty {
                    PlanNowCard(
                        blocks: blocks,
                        nowSeconds: s,
                        cleared: model.cleared,
                        busy: model.busy,
                        onStillGoing: { b in model.stillGoing(b, nowMin: s / 60, today: today) },
                        onClear: { b in
                            LIHaptics.check()
                            model.cleared.insert(b.id)
                        }
                    )
                    .padding(.top, 16)
                }
                if !issues.isEmpty {
                    PlanConflictList(issues: issues) { b in openId = b.id }
                        .padding(.top, 12)
                }
                dayHeader(count: blocks.count).padding(.top, 28)
                errandRow(blocks: blocks, today: today)
                    .padding(.top, 12)
                dayBody(blocks: blocks, seconds: seconds, flagged: flagged)
                    .padding(.top, 20)
                LISectionLabel("Calendar").padding(.top, 32).padding(.bottom, 12)
                PlanCalendarSection(model: calendar) {
                    Task {
                        await model.load(today: today)
                        if model.date == today { await store.reload() }
                    }
                }
                templateRow.padding(.top, 20)
            }
            .refreshable {
                await model.load(today: today)
                await store.reload()
                if await calendar.sync() { await model.load(today: today) }
            }
            toastView
        }
    }

    private func header(today: DateStr, isToday: Bool) -> some View {
        HStack(alignment: .center, spacing: 4) {
            LIPageHeader("Plan")
            Spacer()
            if !isToday {
                Button {
                    LIHaptics.tap()
                    model.select(today, today: today)
                } label: {
                    Text("Today").liType(.sub).foregroundColor(theme.ink).padding(.horizontal, 14).frame(minHeight: 44)
                }
                .buttonStyle(LIPressStyle())
            }
            Button {
                LIHaptics.tap()
                adding = PlanAddRequest(at: nil)
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 19, weight: .regular))
                    .foregroundColor(theme.accentInk)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(theme.gradient))
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Add a block")
        }
    }

    private func dayTitle(isToday: Bool) -> some View {
        var parts: [String] = []
        if let c = store.mode.challenge, Challenges.ranOn(c, model.date) {
            parts.append("Day \(LIDate.dayNumber(c.startDate, model.date)) of \(c.lengthDays)")
        }
        if model.isOwn { parts.append("Edited") }
        let label = parts.isEmpty ? (isToday ? "Today" : "From the weekly plan") : parts.joined(separator: ", ")
        return VStack(alignment: .leading, spacing: 8) {
            Text(label).liType(.label).foregroundColor(theme.ink2)
            Text(LIDate.formatDateLong(model.date)).liType(.title).foregroundColor(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 20)
    }

    private func dayHeader(count: Int) -> some View {
        LISectionLabel("Day", trailing: count > 0 ? "\(count) blocks" : nil)
    }

    private func errandRow(blocks: [DayBlock], today: DateStr) -> some View {
        let errand = PlanRules.findErrand(blocks)
        return HStack(spacing: 12) {
            Image(systemName: "mappin").font(.system(size: 16)).foregroundColor(theme.ink2).frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text("9:00 clock-in errand").liType(.body).foregroundColor(theme.ink)
                if let e = errand {
                    Text("\(LIDate.formatTime(e.start)) to \(LIDate.formatTime(e.end))").liType(.caption).foregroundColor(theme.ink2)
                }
            }
            Spacer(minLength: 8)
            Toggle("9:00 clock-in errand", isOn: Binding(
                get: { PlanRules.findErrand(model.blocks) != nil },
                set: { on in
                    LIHaptics.tap()
                    model.setErrand(on, today: today)
                }
            ))
            .labelsHidden()
            .tint(theme.accent)
            .disabled(model.busy || model.loading)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 60)
        .background(LITileSurface(radius: 20))
    }

    @ViewBuilder
    private func dayBody(blocks: [DayBlock], seconds: Int?, flagged: Set<String>) -> some View {
        if model.loading {
            RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile).frame(height: 360)
        } else if blocks.isEmpty {
            LICard {
                LIEmptyState(title: "Nothing planned", message: "No template for this weekday yet.", actionTitle: "Add a block") {
                    adding = PlanAddRequest(at: nil)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                PlanTimeline(
                    blocks: blocks,
                    nowSeconds: seconds,
                    flagged: flagged,
                    cleared: model.cleared,
                    disabled: model.busy,
                    onOpen: { b in openId = b.id },
                    onCommit: { after, result in
                        model.commit(after, result: result, done: nil, today: store.today)
                    },
                    onAddAt: { minute in adding = PlanAddRequest(at: minute) }
                )
                HStack {
                    Text("Hold to drag. Tap a gap to add.").liType(.sub).foregroundColor(theme.ink2)
                    Spacer()
                    if model.isOwn {
                        Button {
                            LIHaptics.tap()
                            confirmReset = true
                        } label: {
                            Label("Reset", systemImage: "arrow.counterclockwise")
                                .liType(.sub)
                                .foregroundColor(theme.ink2)
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
            }
        }
    }

    private var templateRow: some View {
        Button {
            LIHaptics.tap()
            showTemplate = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "calendar.day.timeline.left").font(.system(size: 16)).foregroundColor(theme.ink2).frame(width: 22)
                Text("Edit the weekly plan").liType(.body).foregroundColor(theme.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.ink3)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            .background(LITileSurface(radius: 20))
            .contentShape(Rectangle())
        }
        .buttonStyle(LIPressStyle())
    }

    @ViewBuilder
    private var toastView: some View {
        if let toast = model.toast {
            Text(toast.text)
                .liType(.sub)
                .foregroundColor(toast.bad ? theme.warn : theme.ink)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .background(Capsule().fill(theme.surface2))
                .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
                .padding(.bottom, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .onTapGesture { model.toast = nil }
                .accessibilityAddTraits(.isStaticText)
        }
    }

    private var resetSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Reset this day?").liType(.h1).foregroundColor(theme.ink)
            Text("\(LIDate.formatDateLong(model.date)) goes back to the template. Changes made on this day are removed.")
                .liType(.sub).foregroundColor(theme.ink2)
            HStack(spacing: 12) {
                LISecondaryButton("Keep it") { confirmReset = false }
                LIPrimaryButton("Reset") {
                    confirmReset = false
                    model.reset(today: store.today)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlanAddRequest: Identifiable {
    let id = UUID()
    let at: Int?
}
