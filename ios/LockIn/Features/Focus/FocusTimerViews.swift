import SwiftUI
import UIKit
import LockInKit

/// The big clock and its controls while a timer runs. The card on the page, and larger in the full screen focus view.
struct RunningTimerView: View {
    @Environment(\.liTheme) private var theme
    let live: FocusLiveTimer
    let clock: FocusClock
    /// The instant `clock` was worked out for, epoch ms.
    let nowMs: Double
    var big = false
    var onExpand: (() -> Void)? = nil
    let onFinished: (FocusFinishResult?) -> Void

    @State private var busy = false
    @State private var pulse = false
    private let focus = FocusStore.shared

    private var countdown: Bool { return clock.remaining != nil }
    private var over: Bool { return countdown && clock.remaining == 0 }
    private var low: Bool { return countdown && !over && (clock.remaining ?? 0) <= 5 * 60 }
    private var shown: Int { return over ? clock.overBy : (clock.remaining ?? clock.focusedSeconds) }

    private var timeColor: Color {
        if over { return theme.accent }
        if low { return theme.warn }
        if clock.paused { return theme.ink2 }
        return theme.ink
    }

    private var statusText: String {
        if over { return "Time is up" }
        if clock.paused { return "Paused" }
        return countdown ? "Counting down" : "Focusing"
    }

    private var note: String {
        if over { return "You hit \(LIDate.formatDuration(Int(((live.plannedSeconds ?? 0) / 60.0).rounded())))." }
        if clock.awayCount > 0 {
            let times = clock.awayCount == 1 ? "time" : "times"
            return "Left \(clock.awayCount) \(times), \(Focus.formatAway(clock.awaySeconds)) away. \(Focus.formatAway(clock.clockSeconds)) on the wall clock."
        }
        if clock.pausedSeconds > 0 { return "\(Focus.formatAway(clock.pausedSeconds)) paused." }
        return "Only focused time counts."
    }

    var body: some View {
        if big { bigBody } else { cardBody }
    }

    private var status: some View {
        HStack(spacing: 8) {
            if !clock.paused && !over {
                Circle()
                    .fill(theme.accent)
                    .frame(width: 6, height: 6)
                    .opacity(pulse ? 0.3 : 1)
                    .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: pulse)
                    .onAppear { pulse = true }
            }
            Text(statusText)
                .liType(.label)
                .foregroundColor(over ? theme.warn : (clock.paused ? theme.ink2 : theme.accent))
        }
    }

    private func timeText(size: LIType) -> some View {
        Text((over ? "+" : "") + Focus.formatCountdown(shown))
            .liType(size)
            .monospacedDigit()
            .foregroundColor(timeColor)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .contentTransition(.identity)
    }

    private var controls: some View {
        HStack(spacing: 10) {
            if over {
                FocusSecondaryButton(title: "Keep going") { focus.keepGoing() }
            } else {
                FocusSecondaryButton(title: clock.paused ? "Resume" : "Pause") {
                    // Pause at the instant on screen, so the clock does not tick once more after the tap.
                    if clock.paused { focus.resume() } else { focus.pause(at: nowMs) }
                }
            }
            LIPrimaryButton("Finish", busy: busy) {
                busy = true
                Task {
                    let result = await focus.finish()
                    busy = false
                    onFinished(result)
                }
            }
        }
    }

    private var cardBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                status
                Spacer()
                if let onExpand = onExpand {
                    Button(action: {
                        LIHaptics.tap()
                        onExpand()
                    }) {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundColor(theme.ink2)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(LIPressStyle())
                    .padding(.trailing, -10)
                    .padding(.vertical, -12)
                    .accessibilityLabel("Open focus mode")
                }
            }
            timeText(size: .display).padding(.top, 8)
            Text(live.label).liType(.body).foregroundColor(theme.ink2).lineLimit(1).padding(.top, 2)
            if countdown {
                LIProgressBar(value: clock.progress).padding(.top, 14)
            }
            Text(note).liType(.sub).foregroundColor(theme.ink2).padding(.top, 12)
            controls.padding(.top, 16)
        }
    }

    private var bigBody: some View {
        VStack(spacing: 0) {
            LIProgressRing(value: countdown ? clock.progress : 0, size: 288, stroke: 3) {
                VStack(spacing: 10) {
                    status
                    timeText(size: .display)
                    Text(live.label).liType(.body).foregroundColor(theme.ink2).lineLimit(1)
                }
                .padding(.horizontal, 28)
            }
            Text(note)
                .liType(.sub)
                .foregroundColor(theme.ink2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)
                .padding(.top, 24)
            controls
                .frame(maxWidth: 320)
                .padding(.top, 28)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Pick what and how long, then start.
struct FocusStartPanel: View {
    @Environment(\.liTheme) private var theme
    let startInFocusMode: Bool
    let onStarted: () -> Void

    @State private var label = "Study"
    @State private var custom = ""
    @State private var length = 0
    @State private var busy = false
    private let focus = FocusStore.shared

    private let labelOptions = Focus.labels + ["Other"]
    private let lengths: [(value: Int, title: String)] = [(value: 0, title: "Open"), (value: 25, title: "25"), (value: 45, title: "45"), (value: 60, title: "60"), (value: 90, title: "90")]

    var body: some View {
        LICard(feature: true) {
            VStack(alignment: .leading, spacing: 0) {
                Text(length > 0 ? "Countdown" : "Count up").liType(.label).foregroundColor(theme.accent)
                Text(Focus.formatCountdown(length * 60))
                    .liType(.display)
                    .monospacedDigit()
                    .foregroundColor(theme.ink2)
                    .padding(.top, 8)
                FocusFlow(spacing: 8) {
                    ForEach(labelOptions, id: \.self) { option in
                        LIChip(option, on: label == option) { label = option }
                    }
                }
                .padding(.top, 18)
                if label == "Other" {
                    FocusField(placeholder: "What is it", text: $custom)
                        .padding(.top, 10)
                }
                Text("Length in minutes").liType(.label).foregroundColor(theme.ink2).padding(.top, 18)
                LISegmentedControl(options: lengths, selection: $length)
                    .padding(.top, 8)
                LIPrimaryButton(startInFocusMode ? "Start in focus mode" : "Start", busy: busy) {
                    start()
                }
                .padding(.top, 20)
            }
        }
    }

    private func start() {
        busy = true
        Task {
            let ok = await focus.start(label: label == "Other" ? custom : label, plannedSeconds: length > 0 ? length * 60 : nil)
            busy = false
            if ok { onStarted() }
        }
    }
}

/// Just the clock. The screen stays on and leaving the app is recorded.
struct FocusModeScreen: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let onFinished: (FocusFinishResult?) -> Void
    private let focus = FocusStore.shared

    var body: some View {
        ZStack {
            LIBackground()
            VStack(spacing: 0) {
                HStack {
                    Text("Focus mode").liType(.label).foregroundColor(theme.ink2)
                    Spacer()
                    Button(action: {
                        LIHaptics.tap()
                        dismiss()
                    }) {
                        Image(systemName: "arrow.down.right.and.arrow.up.left")
                            .font(.system(size: 16, weight: .regular))
                            .foregroundColor(theme.ink)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(theme.tile))
                            .overlay(Circle().strokeBorder(theme.tileLine, lineWidth: 1))
                    }
                    .buttonStyle(LIPressStyle())
                    .accessibilityLabel("Exit focus mode")
                }
                .frame(height: 44)
                Spacer()
                if let live = focus.live {
                    TimelineView(.periodic(from: .now, by: 1)) { ctx in
                        let ms = ctx.date.timeIntervalSince1970 * 1000.0
                        RunningTimerView(live: live, clock: Focus.clockOf(live, now: ms), nowMs: ms, big: true, onExpand: nil) { result in
                            onFinished(result)
                            dismiss()
                        }
                    }
                }
                Spacer()
                Text("Screen stays on. Leaving is recorded.")
                    .liType(.caption)
                    .foregroundColor(theme.ink2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .onChange(of: focus.live == nil) { _, gone in
            if gone { dismiss() }
        }
    }
}
