import SwiftUI
import LockInKit

/// The body of a screen that has not been built natively yet. It says so and points at the web app, which still has it.
struct ComingSoon: View {
    let title: String
    var note: String = "This screen is still on the web app. It is coming here next."

    var body: some View {
        LIScreen {
            LIPageHeader(title)
            LICard {
                LIEmptyState(title: title, message: note)
            }
            .padding(.top, 8)
        }
    }
}
