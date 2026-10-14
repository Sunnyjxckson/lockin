import SwiftUI
import LockInKit

@main
struct LockInApp: App {
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
