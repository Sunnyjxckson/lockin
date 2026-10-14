import SwiftUI
import LockInKit

struct RootView: View {
    @Environment(SessionStore.self) private var session

    private var theme: LITheme {
        return session.store?.theme ?? LITheme.dark
    }

    var body: some View {
        content
            .environment(\.liTheme, theme)
            .preferredColorScheme(theme.colorScheme)
            .tint(theme.accent)
    }

    @ViewBuilder
    private var content: some View {
        switch session.phase {
        case .checking:
            ZStack {
                LIBackground()
                ProgressView().tint(theme.ink2)
            }
        case .signedOut(let note):
            LoginView(note: note)
        case .problem(let message):
            ProblemView(message: message)
        case .signedIn:
            if let store = session.store {
                MainTabs().environment(store)
            } else {
                ZStack {
                    LIBackground()
                    ProgressView().tint(theme.ink2)
                }
            }
        }
    }
}

/// The server answered but cannot be used yet.
struct ProblemView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.liTheme) private var theme
    let message: String

    var body: some View {
        ZStack {
            LIBackground()
            VStack(spacing: 18) {
                LIEmptyState(title: "Server not ready", message: message)
                LISecondaryButton("Try again") {
                    Task { await session.retry() }
                }
                LISecondaryButton("Change server") {
                    session.phase = .signedOut(nil)
                }
            }
            .padding(.horizontal, 20)
        }
    }
}
