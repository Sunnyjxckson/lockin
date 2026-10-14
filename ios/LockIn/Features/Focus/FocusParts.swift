import SwiftUI
import LockInKit

/// A row of wrapped pills.
struct FocusFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? CGFloat.infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var width: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            width = max(width, x - spacing)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Full width glass pill, for a pair of buttons side by side.
struct FocusSecondaryButton: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            Text(title)
                .liType(.body)
                .foregroundColor(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(theme.tile))
                .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
    }
}

/// A text field in the quiet tile look.
struct FocusField: View {
    @Environment(\.liTheme) private var theme
    let placeholder: String
    @Binding var text: String
    var limit: Int = 40

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundColor(theme.ink3))
            .liType(.body)
            .foregroundColor(theme.ink)
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .background(LITileSurface(radius: 16))
            .onChange(of: text) { _, value in
                if value.count > limit { text = String(value.prefix(limit)) }
            }
    }
}

/// A big number with a round minus and plus either side.
struct FocusStepper: View {
    @Environment(\.liTheme) private var theme
    @Binding var value: Int
    let range: ClosedRange<Int>
    let step: Int
    var unit: String = "min"

    var body: some View {
        HStack(spacing: 16) {
            roundButton("minus", enabled: value > range.lowerBound) {
                value = max(range.lowerBound, value - step)
            }
            VStack(spacing: 2) {
                Text("\(value)")
                    .liType(.num)
                    .foregroundColor(theme.ink)
                    .monospacedDigit()
                Text(unit).liType(.label).foregroundColor(theme.ink2)
            }
            .frame(maxWidth: .infinity)
            roundButton("plus", enabled: value < range.upperBound) {
                value = min(range.upperBound, value + step)
            }
        }
    }

    private func roundButton(_ icon: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .regular))
                .foregroundColor(enabled ? theme.ink : theme.ink3)
                .frame(width: 52, height: 52)
                .background(Circle().fill(theme.tile))
                .overlay(Circle().strokeBorder(theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
        .disabled(!enabled)
    }
}

/// A switch row inside a card.
struct FocusToggleRow: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var sub: String? = nil
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).liType(.body).foregroundColor(theme.ink)
                if let sub = sub {
                    Text(sub).liType(.caption).foregroundColor(theme.ink2)
                }
            }
        }
        .tint(theme.accent)
        .padding(.vertical, 12)
        .onChange(of: isOn) { _, _ in LIHaptics.tap() }
    }
}

/// This week, one bar a day, with the daily goal as a line. The accent only marks a day that reached the goal.
struct FocusWeekChart: View {
    @Environment(\.liTheme) private var theme
    let days: [FocusWeekDay]
    let goal: Int

    private let plotHeight: CGFloat = 86

    var body: some View {
        let top = max(goal, days.map { $0.minutes }.max() ?? 0, 30)
        VStack(spacing: 6) {
            ZStack(alignment: .bottom) {
                if goal > 0 {
                    VStack(spacing: 0) {
                        Spacer(minLength: 0)
                        Rectangle().fill(theme.hair).frame(height: 1)
                            .padding(.bottom, plotHeight * CGFloat(goal) / CGFloat(top))
                    }
                    .frame(height: plotHeight + 16)
                }
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(0..<days.count, id: \.self) { i in
                        bar(days[i], top: top)
                    }
                }
                .frame(height: plotHeight + 16, alignment: .bottom)
            }
            HStack(spacing: 0) {
                ForEach(0..<days.count, id: \.self) { i in
                    Text(days[i].letter)
                        .liType(days[i].today ? .sub : .caption)
                        .foregroundColor(days[i].today ? theme.ink : theme.ink2)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Focus this week, \(LIDate.formatDuration(days.reduce(0) { $0 + $1.minutes })) in total. Daily goal \(LIDate.formatDuration(goal)).")
    }

    @ViewBuilder
    private func bar(_ d: FocusWeekDay, top: Int) -> some View {
        let height = d.minutes > 0 ? max(10, plotHeight * CGFloat(d.minutes) / CGFloat(top)) : 0
        VStack(spacing: 5) {
            Spacer(minLength: 0)
            if d.minutes > 0 {
                Text(LIDate.formatDuration(d.minutes))
                    .liType(.label)
                    .foregroundColor(d.today ? theme.ink : theme.ink2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Capsule()
                    .fill(d.met ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.ink3))
                    .frame(width: 10, height: height)
            } else if !d.future {
                Circle().fill(theme.ink3).frame(width: 4, height: 4)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// A timer left running: the app was away for hours, or the session is longer than anyone works in one sitting.
struct FocusStaleCard: View {
    @Environment(\.liTheme) private var theme
    let live: FocusLiveTimer
    let stale: FocusStale
    let onSettled: (String) -> Void
    @State private var minutes: Int? = nil
    @State private var busy = false
    private let focus = FocusStore.shared

    private var value: Binding<Int> {
        return Binding(get: { minutes ?? stale.suggestedMinutes }, set: { minutes = $0 })
    }

    var body: some View {
        let count = minutes ?? stale.suggestedMinutes
        VStack(alignment: .leading, spacing: 14) {
            Text("Timer left running").liType(.label).foregroundColor(theme.warn)
            Text("\(live.label) has been on the clock for \(LIDate.formatDuration(stale.clockMinutes))")
                .liType(.h2)
                .foregroundColor(theme.ink)
            Text(stale.reason == .away
                 ? "You left the app after \(LIDate.formatDuration(stale.suggestedMinutes)) and did not come back."
                 : "That is longer than one sitting.")
                .liType(.sub)
                .foregroundColor(theme.ink2)
            Text("Minutes that count").liType(.label).foregroundColor(theme.ink2)
            FocusStepper(value: value, range: 0...max(stale.suggestedMinutes, 360), step: 5)
            HStack(spacing: 10) {
                if count >= 1 {
                    LIPrimaryButton("Log \(LIDate.formatDuration(count))", busy: busy) {
                        settle(count)
                    }
                }
                FocusSecondaryButton(title: "Throw it out") { settle(0) }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(theme.warnSoft))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(theme.warn.opacity(0.4), lineWidth: 1))
    }

    private func settle(_ count: Int) {
        busy = true
        Task {
            if count < 1 {
                await focus.discard()
                onSettled("Timer thrown out. Nothing logged.")
            } else {
                _ = await focus.finish(at: stale.endedAt, minutes: count)
                onSettled("\(LIDate.formatDuration(count)) of focus logged")
            }
            busy = false
        }
    }
}
