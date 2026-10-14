import SwiftUI
import LockInKit

/// What is happening right now on today's schedule. For a free time block it is a countdown, and when the time runs out
/// it turns into an alert that stays until it is answered.
struct PlanNowCard: View {
    @Environment(\.liTheme) private var theme

    let blocks: [DayBlock]
    let nowSeconds: Int
    let cleared: Set<String>
    let busy: Bool
    let onStillGoing: (DayBlock) -> Void
    let onClear: (DayBlock) -> Void

    @State private var buzzed: String? = nil

    var body: some View {
        let focus = PlanRules.freeTimeFocus(blocks, nowSeconds: nowSeconds, cleared: cleared)
        Group {
            if let f = focus, f.timer.phase == .over {
                overCard(f.block, f.timer)
            } else if let f = focus {
                liveCard(f.block, f.timer)
            } else {
                nowNext
            }
        }
        .onChange(of: focus?.block.id) { _, _ in buzzIfNeeded(focus) }
        .onAppear { buzzIfNeeded(focus) }
    }

    private func buzzIfNeeded(_ focus: (block: DayBlock, timer: FreeTimerState)?) {
        guard let f = focus, f.timer.phase == .over, buzzed != f.block.id else { return }
        buzzed = f.block.id
        LIHaptics.error()
    }

    private func overCard(_ b: DayBlock, _ t: FreeTimerState) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Time is up").liType(.label).foregroundColor(theme.warn)
                Spacer()
                Text(t.overBy < 60 ? "Just now" : "\(LIDate.formatDuration(t.overBy / 60)) over")
                    .liType(.sub).foregroundColor(theme.ink2)
            }
            Text(b.blockName).liType(.h1).foregroundColor(theme.ink).lineLimit(1)
            Text("Ended at \(LIDate.formatTime(b.end))").liType(.sub).foregroundColor(theme.ink2)
            HStack(spacing: 10) {
                LIPrimaryButton("Done") { onClear(b) }
                Button {
                    LIHaptics.tap()
                    onStillGoing(b)
                } label: {
                    Text("Still going")
                        .liType(.body)
                        .foregroundColor(theme.ink)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Capsule().fill(theme.tile))
                        .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
                }
                .buttonStyle(LIPressStyle())
                .disabled(busy)
            }
            .padding(.top, 10)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(theme.warnSoft))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(theme.warn.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .contain)
    }

    private func liveCard(_ b: DayBlock, _ t: FreeTimerState) -> some View {
        let low = t.remaining <= 5 * 60
        return LICard(feature: true) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    HStack(spacing: 8) {
                        Circle().fill(theme.accent).frame(width: 6, height: 6)
                        Text("Free time").liType(.label).foregroundColor(theme.accent)
                    }
                    Spacer()
                    Text("Until \(LIDate.formatTime(b.end))").liType(.sub).foregroundColor(theme.ink2)
                }
                Text(PlanRules.formatCountdown(t.remaining))
                    .liType(.display)
                    .monospacedDigit()
                    .foregroundColor(low ? theme.warn : theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(b.blockName).liType(.body).foregroundColor(theme.ink2).lineLimit(1)
                LIProgressBar(value: t.progress).padding(.top, 8)
            }
        }
    }

    private var nowNext: some View {
        let time = LIDate.timeFromMinutes(nowSeconds / 60)
        let nn = Blocks.nowAndNext(blocks, time: time)
        return Group {
            if nn.now == nil && nn.next == nil {
                EmptyView()
            } else {
                LICard(feature: true) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline) {
                            HStack(spacing: 8) {
                                if nn.now != nil { Circle().fill(theme.accent).frame(width: 6, height: 6) }
                                Text("Now").liType(.label).foregroundColor(theme.accent)
                            }
                            Spacer()
                            if nn.now != nil, let left = nn.minutesLeft {
                                Text("\(LIDate.formatDuration(left)) left").liType(.sub).foregroundColor(theme.ink2)
                            }
                        }
                        HStack(alignment: .center, spacing: 12) {
                            Text(nn.now?.blockName ?? "Open time").liType(.h1).foregroundColor(theme.ink).lineLimit(1)
                            Spacer(minLength: 4)
                            if let now = nn.now {
                                Button {
                                    LIHaptics.tap()
                                    onStillGoing(now)
                                } label: {
                                    Text("Still going")
                                        .liType(.sub)
                                        .foregroundColor(theme.ink)
                                        .padding(.horizontal, 14)
                                        .frame(minHeight: 36)
                                        .background(Capsule().fill(theme.tile))
                                        .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
                                }
                                .buttonStyle(LIPressStyle())
                                .disabled(busy)
                            }
                        }
                        LIProgressBar(value: nn.now.map { PlanRules.timerState($0, nowSeconds: nowSeconds).progress } ?? 0)
                        HStack(alignment: .firstTextBaseline) {
                            Text("Next").liType(.sub).foregroundColor(theme.ink2)
                            Spacer(minLength: 8)
                            if let next = nn.next {
                                Text(nextLine(next, soon: nn.now == nil, until: nn.minutesUntilNext))
                                    .liType(.sub).foregroundColor(theme.ink2).lineLimit(1)
                            } else {
                                Text("Nothing after this").liType(.sub).foregroundColor(theme.ink2)
                            }
                        }
                    }
                }
            }
        }
    }

    private func nextLine(_ b: DayBlock, soon: Bool, until: Int?) -> String {
        var line = "\(b.blockName) at \(LIDate.formatTime(b.start))"
        if soon, let u = until, u <= 180 { line += ", in \(LIDate.formatDuration(u))" }
        return line
    }
}

/// Everything on the day that sits on top of something else. Tap one to fix it.
struct PlanConflictList: View {
    @Environment(\.liTheme) private var theme
    let issues: [DayIssue]
    let onOpen: (DayBlock) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle").font(.system(size: 13))
                Text("\(issues.count) \(issues.count == 1 ? "conflict" : "conflicts")").liType(.label)
            }
            .foregroundColor(theme.warn)
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 4)
            ForEach(issues) { issue in
                Button {
                    LIHaptics.tap()
                    onOpen(issue.block)
                } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(issue.title).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                            Text(issue.detail).liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        Text("Fix").liType(.sub).foregroundColor(theme.warn)
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(LIPressStyle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.warnSoft))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(theme.warn.opacity(0.4), lineWidth: 1))
    }
}

/// Days to pick from, scrolled so the chosen one is in view.
struct PlanWeekStrip: View {
    @Environment(\.liTheme) private var theme
    let dates: [DateStr]
    let selected: DateStr
    let today: DateStr
    let edited: Set<DateStr>
    let onSelect: (DateStr) -> Void

    private static let names = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(dates, id: \.self) { date in
                        cell(date).id(date)
                    }
                }
                .padding(.vertical, 2)
            }
            .onAppear { proxy.scrollTo(selected, anchor: .center) }
            .onChange(of: selected) { _, new in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(new, anchor: .center) }
            }
        }
    }

    private func cell(_ date: DateStr) -> some View {
        let on = date == selected
        let isToday = date == today
        let weekday = LIDate.weekdayOf(date)
        let dayNumber = Int(date.suffix(2)) ?? 1
        return Button {
            LIHaptics.tap()
            onSelect(date)
        } label: {
            VStack(spacing: 2) {
                Text(PlanWeekStrip.names[weekday % 7])
                    .liType(.label)
                    .foregroundColor(on ? theme.bg : theme.ink2)
                Text("\(dayNumber)")
                    .liType(.body)
                    .foregroundColor(on ? theme.bg : (date < today ? theme.ink2 : theme.ink))
                Circle()
                    .fill(edited.contains(date) ? (on ? theme.bg : theme.ink3) : Color.clear)
                    .frame(width: 5, height: 5)
                    .padding(.top, 2)
            }
            .frame(width: 44, height: 62)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(on ? theme.ink : theme.tile))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(isToday && !on ? theme.ink2 : Color.clear, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
        .accessibilityLabel("\(LIDate.formatDateShort(date))\(isToday ? ", today" : "")")
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}
