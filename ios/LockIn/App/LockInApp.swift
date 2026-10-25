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
                .onOpenURL { url in
                    // A widget tap: lockin://app/library/read?w=<writer>&q=<quote>. The path and query are an app path.
                    guard url.scheme == "lockin" else { return }
                    let path = url.path.isEmpty ? "/today" : url.path
                    AppRouter.shared.open(url.query.map { path + "?" + $0 } ?? path)
                }
        }
    }
}
