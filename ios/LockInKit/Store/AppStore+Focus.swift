import Foundation

extension AppStore {
    // MARK: the study item

    private static func loadTicks() -> [String: Bool] {
        guard let data = AppGroup.defaults.data(forKey: SystemPrefs.Key.autoTicks),
              let dict = try? JSONDecoder().decode([String: Bool].self, from: data) else { return [:] }
        return dict
    }

    private static func saveTicks(_ dict: [String: Bool]) {
        guard let data = try? JSONEncoder().encode(dict) else { return }
        AppGroup.defaults.set(data, forKey: SystemPrefs.Key.autoTicks)
    }

    /// Bring the "Study or homework block" item in line with a date's focus sessions (syncStudy in src/features/focus/store.ts).
    /// Only yesterday and today are touched, older days are settled. Never removes a tick the user made by hand.
    public func syncStudy(date: DateStr) async {
        let t = LIDate.todayNY()
        if date > t || date < LIDate.addDays(t, -1) { return }
        if LIDate.isDayLocked(date, installedOn: settings.map { LIDate.nyParts(iso: $0.createdAt).date }) { return }
        guard let item = items.first(where: { $0.key == "study" }), item.active else { return }
        do {
            let sessions = try await db.list(FocusSession.self, Query(from: date, to: date))
            let log = try await db.first(DayLog.self, Query(eq: ["date": .string(date), "item_id": .string(item.id)]))
            var ticks = AppStore.loadTicks()
            let decision = Focus.studyTick(
                minutes: Focus.minutesOn(sessions, date),
                goal: settings?.focusGoalMinutes ?? 0,
                blockCompleted: sessions.contains { $0.end != nil && $0.blockId != nil && $0.completed },
                checked: log?.checked == true,
                autoTicked: ticks[date] == true
            )
            if decision == .none { return }
            let tick = decision == .tick
            if date == today {
                setChecked(item, tick)
            } else {
                let row = AppStore.logRow(date: date, itemId: item.id, value: log?.value, checked: tick, text: log?.text, completedAt: tick ? LIDate.nowIso() : nil, slips: log?.slips ?? 0)
                _ = try await db.upsert(DayLog.self, row, conflict: ["date", "item_id"])
                await reload()
            }
            var next: [String: Bool] = [:]
            let keep = LIDate.addDays(t, -7)
            for (d, v) in ticks where d >= keep { next[d] = v }
            if tick { next[date] = true } else { next.removeValue(forKey: date) }
            ticks = next
            AppStore.saveTicks(ticks)
        } catch {
            // The next session or the next launch tries again.
        }
    }

    // MARK: the goal

    /// Set the daily focus goal in minutes (app_settings.focus_goal_minutes).
    public func setFocusGoal(_ minutes: Int) async -> Bool {
        do {
            _ = try await db.update(AppSettings.self, id: "app", patch: ["focus_goal_minutes": .int(max(0, min(720, minutes)))])
            await reload()
            return true
        } catch {
            return false
        }
    }
}
