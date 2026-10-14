import SwiftUI
import LockInKit

@main
struct LockInApp: App {
    @UIApplicationDelegateAdaptor(SystemAppDelegate.self) private var appDelegate
    @State private var session = SessionStore()

    init() {
        LIFont.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { await session.bootstrap() }
        }
    }
}
