import SwiftUI
import LockInKit

/// Placeholder settings: shows the server and lets you sign out. The full settings land later.
struct SettingsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    var body: some View {
        LIScreen {
            LIPageHeader("Settings")
            LICard {
                VStack(alignment: .leading, spacing: 14) {
                    LIStat(label: "Server", value: session.serverText)
                    LIHairline()
                    LIStat(label: "Look", value: store.theme.base == .contrast ? "High contrast" : "Aubergine")
                    LIHairline()
                    LIStat(label: "Font", value: LIFont.isAvailable ? "Schibsted Grotesk" : "System")
                }
            }
            .padding(.top, 8)

            LISecondaryButton("Sign out") {
                Task { await session.logout() }
            }
            .padding(.top, 20)

            Text("Checklist, targets, schedule and reminders are edited on the web app for now.")
                .liType(.sub)
                .foregroundColor(theme.ink2)
                .padding(.top, 20)
        }
    }
}
