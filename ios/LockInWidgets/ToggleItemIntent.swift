import AppIntents
import WidgetKit
import LockInKit

/// A tap on a row of the large widget. Writes day_log through the API with the shared cookie and updates the snapshot.
struct ToggleItemIntent: AppIntent {
    static var title: LocalizedStringResource = "Check off"
    static var isDiscoverable: Bool { return false }

    @Parameter(title: "Item")
    var itemId: String

    init() {}

    init(itemId: String) {
        self.itemId = itemId
    }

    func perform() async throws -> some IntentResult {
        await WidgetActions.toggle(itemId: itemId)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
