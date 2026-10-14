import SwiftUI
import LockInKit

/// Study and focus (PRD 18). Start a timer or log hours by hand, see today against the goal and the week by day,
/// lock the phone's distracting apps while it runs, and keep the study item on the checklist in step.
struct FocusView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(SystemPrefs.Key.fullScreen, store: AppGroup.defaults) private var fullPref = false

    @State private var sheet: SessionTarget? = nil
    @State private var goalOpen = false
    @State private var focusMode = false
    @State private var toast: String? = nil

    private let focus = FocusStore.shared

    var body: some View {
        ZStack(alignment: .bottom) {
            LIScreen {
                header
                banners
                liveSections
                sessionsSection
                FocusLockCard().padding(.top, 28)
                SystemSettingsCard().padding(.top, 28)
            }
            if let text = toast {
                Text(text)
                    .liType(.sub)
                    .foregroundColor(theme.ink)
                    .padding(.horizontal, 18)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(theme.surface2))
                    .overlay(Capsule().strokeBorder(theme.glassLine, lineWidth: 1))
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.25), value: toast)
        .task { await focus.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await focus.refresh() } }
        }
        .sheet(item: $sheet) { target in
            SessionSheet(session: target.session, today: LIDate.todayNY()) { message in show(message) }
                .liSheetStyle()
        }
        .sheet(isPresented: $goalOpen) {
            FocusGoalSheet(current: store.settings?.focusGoalMinutes ?? 60)
                .liSheetStyle()
                .presentationDetents([.medium])
        }
        .fullScreenCover(isPresented: $focusMode) {
            FocusModeScreen { result in report(result) }
        }
    }

    // MARK: pieces

    private var header: some View {
        ZStack(alignment: .topTrailing) {
            LIPageHeader("Focus", subtitle: "Count only the time you stayed.")
            Button(action: {
                LIHaptics.tap()
                sheet = SessionTarget(session: nil)
            }) {
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundColor(theme.ink)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Log focus time by hand")
            .padding(.top, 10)
        }
    }

    @ViewBuilder
    private var banners: some View {
        if let note = focus.notice {
            LINotice(note, actionTitle: "Got it") { focus.setNotice(nil) }
                .padding(.top, 12)
        }
        if let error = focus.error {
            LINotice(error, actionTitle: "Dismiss") { focus.error = nil }
                .padding(.top, 12)
        }
    }

    @ViewBuilder
    private var liveSections: some View {
        if focus.live != nil {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                sections(nowMs: ctx.date.timeIntervalSince1970 * 1000.0)
            }
        } else {
            sections(nowMs: Focus.nowMs())
        }
    }

    private func sections(nowMs: Double) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            timerArea(nowMs)
                .padding(.top, 12)
            todaySection(nowMs)
                .padding(.top, 28)
            weekSection(nowMs)
                .padding(.top, 28)
        }
    }

    // MARK: timer

    @ViewBuilder
    private func timerArea(_ ms: Double) -> some View {
        if let live = focus.live {
            let stale = Focus.staleInfo(live, now: ms)
            if let stale = stale {
                FocusStaleCard(live: live, stale: stale) { message in show(message) }
            } else {
                VStack(spacing: 12) {
                    if let away = Focus.pendingAway(live) {
                        awayCard(away, ms)
                    }
                    LICard(feature: true) {
                        RunningTimerView(live: live, clock: Focus.clockOf(live, now: ms), nowMs: ms, big: false, onExpand: { focusMode = true }) { result in
                            report(result)
                        }
                    }
                }
            }
        } else if focus.loading {
            LICard(feature: true) {
                ProgressView().tint(theme.ink2).frame(maxWidth: .infinity, minHeight: 200)
            }
        } else {
            VStack(spacing: 12) {
                if let study = Focus.liveStudyBlock(store.blocks, nowSeconds: LIDate.nyParts(Date()).minutes * 60 + Calendar.current.component(.second, from: Date())) {
                    studyBlockTile(study.block, remaining: study.remainingSeconds)
                }
                FocusStartPanel(startInFocusMode: fullPref) {
                    if fullPref { focusMode = true }
                }
            }
        }
    }

    private func awayCard(_ away: FocusAway, _ ms: Double) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Gone for \(Focus.formatAway(Int(((away.to ?? ms) - away.from) / 1000.0)))")
                .liType(.h2)
                .foregroundColor(theme.ink)
            Text("Off the clock until you say otherwise.").liType(.sub).foregroundColor(theme.ink2)
            HStack(spacing: 10) {
                FocusSecondaryButton(title: "Leave it off") { focus.reviewAways(counted: false) }
                FocusSecondaryButton(title: "I was working") { focus.reviewAways(counted: true) }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(theme.warnSoft))
    }

    private func studyBlockTile(_ block: DayBlock, remaining: Int) -> some View {
        HStack(spacing: 12) {
            Circle().fill(theme.accent).frame(width: 6, height: 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(block.blockName).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                Text("On now until \(LIDate.formatTime(block.end)), \(LIDate.formatDuration(remaining / 60)) left")
                    .liType(.caption)
                    .foregroundColor(theme.ink2)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Button(action: {
                LIHaptics.tap()
                Task {
                    let ok = await focus.start(label: "Study", plannedSeconds: remaining, blockId: block.id)
                    if ok && fullPref { focusMode = true }
                }
            }) {
                Text("Start it")
                    .liType(.sub)
                    .foregroundColor(theme.bg)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(theme.ink))
            }
            .buttonStyle(LIPressStyle())
        }
        .padding(.vertical, 8)
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .frame(minHeight: 60)
        .background(LITileSurface(radius: 20))
    }

    // MARK: today and week

    private var goal: Int { return store.settings?.focusGoalMinutes ?? 60 }

    private func liveMinutes(_ ms: Double) -> (date: DateStr, minutes: Int)? {
        guard let live = focus.live else { return nil }
        let clock = Focus.clockOf(live, now: ms)
        let date = LIDate.nyParts(Date(timeIntervalSince1970: live.startedAt / 1000.0)).date
        return (date: date, minutes: clock.focusedSeconds / 60)
    }

    private func todaySection(_ ms: Double) -> some View {
        let today = LIDate.todayNY()
        let live = liveMinutes(ms)
        let minutes = Focus.minutesOn(focus.sessions, today) + ((live?.date == today) ? (live?.minutes ?? 0) : 0)
        let met = goal > 0 && minutes >= goal
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Today").liType(.label).foregroundColor(theme.ink2)
                Spacer()
                Button(action: {
                    LIHaptics.tap()
                    goalOpen = true
                }) {
                    HStack(spacing: 6) {
                        Text(goal > 0 ? "Goal \(LIDate.formatDuration(goal))" : "Set a goal").liType(.label)
                        Image(systemName: "pencil").font(.system(size: 10, weight: .regular))
                    }
                    .foregroundColor(theme.ink2)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(LIPressStyle())
                .padding(.vertical, -12)
            }
            Text(LIDate.formatDuration(minutes))
                .liType(.num)
                .foregroundColor(met ? theme.accent : theme.ink)
                .monospacedDigit()
            LIProgressBar(value: Focus.goalProgress(minutes: minutes, goal: goal))
            Text(met ? "Goal reached. Study is ticked on today's checklist." : (goal > 0 ? "\(LIDate.formatDuration(max(0, goal - minutes))) to go." : "No goal set."))
                .liType(.sub)
                .foregroundColor(theme.ink2)
        }
    }

    private func weekSection(_ ms: Double) -> some View {
        let today = LIDate.todayNY()
        let days = Focus.weekByDay(focus.sessions, today: today, goal: goal, live: liveMinutes(ms))
        let total = days.reduce(0) { $0 + $1.minutes }
        let atGoal = days.filter { $0.met }.count
        return VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("This week", trailing: "\(atGoal) of 7 at goal")
            Text(LIDate.formatDuration(total)).liType(.stat).foregroundColor(theme.ink)
            FocusWeekChart(days: days, goal: goal)
                .padding(.top, 4)
        }
    }

    // MARK: sessions

    private var sessionsSection: some View {
        let today = LIDate.todayNY()
        let rows = Array(focus.sessions.prefix(30))
        return VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Sessions", trailing: focus.sessions.isEmpty ? nil : String(focus.sessions.count))
            if rows.isEmpty {
                LICard {
                    LIEmptyState(
                        title: "No sessions yet",
                        message: "Start the timer, or log time you already put in.",
                        actionTitle: "Log time by hand",
                        action: { sheet = SessionTarget(session: nil) }
                    )
                }
            } else {
                LICard(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(0..<rows.count, id: \.self) { i in
                            if i > 0 { LIHairline() }
                            sessionRow(rows[i], today: today)
                        }
                    }
                }
            }
        }
        .padding(.top, 28)
    }

    private func sessionRow(_ s: FocusSession, today: DateStr) -> some View {
        var bits: [String] = [s.date == today ? "Today" : LIDate.formatDateShort(s.date)]
        bits.append(s.source == .manual ? "by hand" : LIDate.formatTime(s.start))
        if s.awayCount > 0 {
            let times = s.awayCount == 1 ? "time" : "times"
            var away = "left the app \(s.awayCount) \(times)"
            if s.awayMinutes > 0 { away += ", \(LIDate.formatDuration(s.awayMinutes)) away" }
            bits.append(away)
        }
        if s.completed && s.blockId != nil { bits.append("block done") }
        return Button(action: {
            LIHaptics.tap()
            sheet = SessionTarget(session: s)
        }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.label ?? "Study").liType(.body).foregroundColor(theme.ink).lineLimit(1)
                    Text(bits.joined(separator: ", ")).liType(.caption).foregroundColor(theme.ink2).lineLimit(2)
                }
                Spacer(minLength: 8)
                Text(LIDate.formatDuration(s.minutes)).liType(.value).foregroundColor(theme.ink).monospacedDigit()
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .frame(minHeight: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(LIPressStyle())
    }

    // MARK: feedback

    private func report(_ result: FocusFinishResult?) {
        guard let r = result else { return }
        if r.logged {
            let away = r.awayCount > 0 ? ", away \(r.awayCount) \(r.awayCount == 1 ? "time" : "times")" : ""
            show("\(LIDate.formatDuration(r.minutes)) of focus logged\(away)")
        } else {
            show("Under a minute. Nothing logged.")
        }
    }

    private func show(_ text: String) {
        toast = text
        Task {
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if toast == text { toast = nil }
        }
    }
}
