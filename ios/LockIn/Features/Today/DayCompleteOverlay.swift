import SwiftUI
import LockInKit

/// The bigger moment when the last item of the day lands. Closes itself.
struct DayCompleteOverlay: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let total: Int
    let streak: Int
    let onDone: () -> Void

    @State private var appeared = false

    var body: some View {
        ZStack {
            theme.bg.opacity(0.94).ignoresSafeArea()
            LIBackground().opacity(0.6)
            VStack(spacing: 18) {
                LIProgressRing(value: appeared ? 1 : 0, size: 168, stroke: 8) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 54, weight: .medium))
                        .foregroundColor(theme.accent)
                        .scaleEffect(appeared ? 1 : 0.4)
                        .opacity(appeared ? 1 : 0)
                }
                Text("\(title) locked in").liType(.title).foregroundColor(theme.ink).multilineTextAlignment(.center)
                Text(subline).liType(.sub).foregroundColor(theme.ink2)
            }
            .padding(.horizontal, 32)
        }
        .contentShape(Rectangle())
        .onTapGesture { onDone() }
        .onAppear {
            withAnimation(.spring(response: 0.7, dampingFraction: 0.7)) { appeared = true }
        }
        .task {
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            onDone()
        }
    }

    private var subline: String {
        if streak >= 2 { return "All \(total) done. \(streak) full days in a row." }
        return "All \(total) done."
    }
}
