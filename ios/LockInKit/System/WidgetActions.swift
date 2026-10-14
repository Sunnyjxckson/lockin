import Foundation

/// The write behind a tap on the large widget. Runs in the widget extension: it uses the shared cookie jar and server address from the
/// app group, writes the same day_log upsert the app does (setChecked in AppStore), and keeps the snapshot in step so the widget redraws at once.
public enum WidgetActions {
    /// Tick or untick one yes/no item for today. Quietly does nothing when the snapshot is from another day or the item is not a tick item.
    public static func toggle(itemId: String, now: Date = Date()) async {
        guard let snapshot = WidgetSnapshot.load(), snapshot.isCurrent(at: now) else { return }
        guard let index = snapshot.items.firstIndex(where: { $0.id == itemId }), snapshot.items[index].type == "yesno" else { return }
        let want = !snapshot.items[index].done
        var optimistic = snapshot
        mark(&optimistic, index: index, done: want)
        optimistic.save()
        do {
            try await write(date: snapshot.date, itemId: itemId, checked: want)
        } catch {
            // Put the picture back the way the server has it.
            var back = optimistic
            mark(&back, index: index, done: !want)
            back.save()
        }
    }

    static func mark(_ snapshot: inout WidgetSnapshot, index: Int, done: Bool) {
        snapshot.items[index].done = done
        let count = snapshot.items.filter { $0.done }.count
        snapshot.done = count
        snapshot.percent = Scoring.percent(count, snapshot.total)
        snapshot.updatedAt = LIDate.nowIso()
    }

    static func write(date: DateStr, itemId: String, checked: Bool) async throws {
        let client = try APIClient.make(from: AppGroup.baseURLString)
        let db = DBClient(api: client)
        let prev = try await db.first(DayLog.self, Query(eq: ["date": .string(date), "item_id": .string(itemId)]))
        let at = LIDate.nowIso()
        let row: JSONObject = [
            "date": .string(date),
            "item_id": .string(itemId),
            "value": JSON.num(prev?.value),
            "checked": .bool(checked),
            "text": JSON.str(prev?.text),
            "completed_at": checked ? .string(at) : .null,
            "slips": .int(prev?.slips ?? 0),
        ]
        _ = try await db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
    }
}
