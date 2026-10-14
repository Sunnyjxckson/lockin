import SwiftUI
import WidgetKit
import ActivityKit
import LockInKit

/// The clock inside the activity: a live countdown or count up, or a still number while paused.
struct ActivityClock: View {
    let state: LockInActivityAttributes.ContentState
    var size: CGFloat = 34
    var color: Color = W.ink

    var body: some View {
        Group {
            if state.paused, let frozen = state.frozenSeconds {
                Text(Focus.formatCountdown(frozen))
            } else if state.countsUp {
                Text(state.start, style: .timer)
            } else {
                Text(timerInterval: state.start...max(state.end, state.start.addingTimeInterval(1)), pauseTime: nil, countsDown: true)
            }
        }
        .font(W.medium(size))
        .tracking(-size * 0.03)
        .monospacedDigit()
        .foregroundColor(state.paused ? W.ink2 : color)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

struct ActivityProgress: View {
    let state: LockInActivityAttributes.ContentState

    var body: some View {
        if state.countsUp {
            EmptyView()
        } else if state.paused, let frozen = state.frozenSeconds {
            let total = max(1.0, state.end.timeIntervalSince(state.start))
            ProgressView(value: max(0, min(1, 1 - Double(frozen) / total)))
                .progressViewStyle(.linear)
                .tint(W.accent)
        } else {
            ProgressView(timerInterval: state.start...max(state.end, state.start.addingTimeInterval(1)), countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.linear)
            .tint(W.accent)
        }
    }
}

private func eyebrow(_ state: LockInActivityAttributes.ContentState) -> String {
    if state.kind == .focus {
        if state.paused { return "Focus, paused" }
        return state.countsUp ? "Focusing" : "Focus"
    }
    return "Now"
}

struct LockScreenActivityView: View {
    let state: LockInActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 6) {
                    if !state.paused && !stale { Circle().fill(W.accent).frame(width: 6, height: 6) }
                    WLabel(stale ? "Done" : eyebrow(state), color: W.accent)
                }
                Spacer()
                Text("Lock In").font(W.medium(11)).foregroundColor(W.ink3)
            }
            HStack(alignment: .lastTextBaseline) {
                Text(state.title)
                    .font(W.medium(22))
                    .tracking(-0.5)
                    .foregroundColor(W.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 12)
                if stale {
                    Text("Time is up").font(W.medium(15)).foregroundColor(W.ink2)
                } else {
                    ActivityClock(state: state, size: 34)
                        .frame(maxWidth: 130, alignment: .trailing)
                }
            }
            if !stale { ActivityProgress(state: state) }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
    }
}

struct LockInLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LockInActivityAttributes.self) { context in
            LockScreenActivityView(state: context.state, stale: context.isStale)
                .activityBackgroundTint(W.bg)
                .activitySystemActionForegroundColor(W.ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 3) {
                        WLabel(eyebrow(context.state), color: W.accent)
                        Text(context.state.title)
                            .font(W.medium(18))
                            .foregroundColor(W.ink)
                            .lineLimit(1)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ActivityClock(state: context.state, size: 28)
                        .frame(maxWidth: 110, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ActivityProgress(state: context.state)
                        .padding(.horizontal, 4)
                        .padding(.top, 2)
                }
            } compactLeading: {
                Image(systemName: context.state.kind == .focus ? "timer" : "circle.fill")
                    .font(.system(size: context.state.kind == .focus ? 13 : 7, weight: .medium))
                    .foregroundColor(W.accent)
            } compactTrailing: {
                ActivityClock(state: context.state, size: 13)
                    .frame(width: 46, alignment: .trailing)
            } minimal: {
                Image(systemName: context.state.kind == .focus ? "timer" : "circle.fill")
                    .font(.system(size: context.state.kind == .focus ? 12 : 7, weight: .medium))
                    .foregroundColor(W.accent)
            }
            .keylineTint(W.accent)
        }
    }
}
