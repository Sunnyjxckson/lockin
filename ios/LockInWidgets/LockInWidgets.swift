import SwiftUI
import WidgetKit
import LockInKit

@main
struct LockInWidgetBundle: WidgetBundle {
    init() {
        LIFont.register()
    }

    var body: some Widget {
        TodayWidget()
        LockScreenWidget()
        QuoteWidget()
        LockInLiveActivity()
    }
}
