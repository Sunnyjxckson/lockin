import Foundation
import Observation
import UIKit

// Body: meals, saved meals, weigh-ins, progress photos and set logging.
// Port of src/features/body/data.ts and the Body screens' reads. After any meal change the day's calorie and
// protein totals are written to the checklist so Today scores them.

// MARK: photos

/// Photo helpers shared by Money and Body: downscale to a JPEG, send it to /api/storage the way src/lib/storage does
/// in Supabase mode, and delete it again. The stored reference is the public URL.
public enum MoneyBodyPhotos {
    /// Downscale so the longest side is at most `maxSize`, as a JPEG. Nil when the data is not an image.
    public static func jpeg(from data: Data, maxSize: CGFloat, quality: CGFloat = 0.82) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        return jpeg(from: image, maxSize: maxSize, quality: quality)
    }

    public static func jpeg(from image: UIImage, maxSize: CGFloat, quality: CGFloat = 0.82) -> Data? {
        let w = image.size.width
        let h = image.size.height
        let longest = Swift.max(w, h)
        if longest <= 0 { return nil }
        let scale = Swift.min(1, maxSize / longest)
        let size = CGSize(width: Swift.max(1, (w * scale).rounded()), height: Swift.max(1, (h * scale).rounded()))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        return renderer.jpegData(withCompressionQuality: quality) { _ in
            image.draw(in: CGRect(origin: CGPoint.zero, size: size))
        }
    }

    public static func dataURL(_ jpeg: Data) -> String {
        return "data:image/jpeg;base64," + jpeg.base64EncodedString()
    }

    private struct UploadReply: Decodable {
        var url: String?
        var error: String?
    }

    /// POST /api/storage as multipart, exactly what the web sends. Returns the public URL.
    public static func upload(api: APIClient, jpeg: Data, folder: String) async throws -> String {
        let boundary = "lockin-" + UUID().uuidString
        var body = Data()
        func add(_ text: String) { body.append(Data(text.utf8)) }
        add("--\(boundary)\r\n")
        add("Content-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n")
        add("Content-Type: image/jpeg\r\n\r\n")
        body.append(jpeg)
        add("\r\n--\(boundary)\r\n")
        add("Content-Disposition: form-data; name=\"folder\"\r\n\r\n")
        add(folder)
        add("\r\n--\(boundary)--\r\n")

        guard let url = URL(string: api.baseURL.absoluteString + "/api/storage") else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "content-type")
        request.httpBody = body
        request.timeoutInterval = 60
        let result: (Data, URLResponse)
        do {
            result = try await api.session.data(for: request)
        } catch {
            throw APIError.offline
        }
        let data = result.0
        guard let http = result.1 as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        let reply = try? JSONDecoder().decode(UploadReply.self, from: data)
        guard (200..<300).contains(http.statusCode), let stored = reply?.url else {
            throw APIError.server(reply?.error ?? "Upload failed", http.statusCode)
        }
        return stored
    }

    /// Delete a stored photo. Never throws: a photo that will not delete should not block anything.
    public static func remove(api: APIClient, ref: String?) async {
        guard let ref = ref, !ref.isEmpty, !ref.hasPrefix("idb:") else { return }
        guard let body = try? JSONEncoder().encode(["url": ref]) else { return }
        _ = try? await api.send(path: "/api/storage", method: "DELETE", body: body)
    }
}

// MARK: store helpers

extension AppStore {
    /// Push the day's totals to the Calories and Protein checklist items.
    @discardableResult
    func syncDayTotals(_ date: DateStr) async throws -> BodyMacros {
        let meals = try await db.list(Meal.self, Query(eq: ["date": .string(date)]))
        let totals = BodyRules.mealTotals(meals)
        let none = meals.isEmpty
        try await writeValueByKey("calories", date: date, value: none ? nil : totals.calories.rounded())
        try await writeValueByKey("protein", date: date, value: none ? nil : totals.protein.rounded())
        return totals
    }

    /// Record a weigh-in: writes body_log and the weekly weigh-in checklist item.
    func logWeight(_ date: DateStr, _ weight: Double?) async throws {
        let prev = try await db.first(BodyLog.self, Query(eq: ["date": .string(date)]))
        _ = try await db.upsert(BodyLog.self, [
            "date": .string(date),
            "weight": JSON.num(weight),
            "photo_url": JSON.str(prev?.photoUrl),
        ], conflict: ["date"])
        try await writeValueByKey("weighin", date: date, value: weight)
    }
}

// MARK: meals and weight

/// A meal as the sheet sends it.
public struct BodyMealInput: Equatable {
    public var name: String?
    public var calories: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double
    /// The photo reference to store. Only used when `changesPhoto` is true.
    public var photoUrl: String?
    public var changesPhoto: Bool

    public init(name: String?, calories: Double, protein: Double, carbs: Double, fat: Double, photoUrl: String? = nil, changesPhoto: Bool = false) {
        self.name = name
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.photoUrl = photoUrl
        self.changesPhoto = changesPhoto
    }

    /// The macro columns, tidied the way data.ts does.
    var tidy: JSONObject {
        func n(_ v: Double) -> Double { return v.isFinite && v > 0 ? (v * 10).rounded() / 10 : 0 }
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return [
            "name": trimmed.isEmpty ? JSON.null : JSON.string(trimmed),
            "calories": .number(n(calories)),
            "protein": .number(n(protein)),
            "carbs": .number(n(carbs)),
            "fat": .number(n(fat)),
        ]
    }
}

/// What the meal photo estimate sends back.
public struct BodyMealEstimate: Equatable {
    public var name: String
    public var calories: Double
    public var protein: Double
    public var carbs: Double
    public var fat: Double
    public var note: String
}

public enum BodyEstimateResult: Equatable {
    case estimate(BodyMealEstimate)
    case fallback
}

@Observable
@MainActor
public final class BodyModel {
    @ObservationIgnored private let store: AppStore

    /// The day on screen in the Food tab.
    public private(set) var date: DateStr
    public private(set) var meals: [Meal] = []
    public private(set) var saved: [SavedMeal] = []
    public private(set) var bodyLogs: [BodyLog] = []
    /// Today's logged sets, for the count on the Workout row.
    public private(set) var todaySets: [SetLog] = []
    public private(set) var mealsLoaded = false
    public private(set) var logsLoaded = false
    public private(set) var loadError: String? = nil

    public init(store: AppStore) {
        self.store = store
        self.date = store.today
    }

    // MARK: loading

    public func load() async {
        // The day may have rolled over since the screen was built.
        if date > store.today { date = store.today }
        await loadMeals()
        await loadSaved()
        await loadLogs()
        if let rows = try? await store.db.list(SetLog.self, Query(eq: ["date": .string(store.today)])) { todaySets = rows }
    }

    private func note(_ error: Error) {
        if let api = error as? APIError {
            loadError = api.isOffline ? "You look offline. Showing the last data." : (api.errorDescription ?? "Could not load.")
        } else {
            loadError = "Could not load."
        }
    }

    public func loadMeals() async {
        let asked = date
        do {
            let rows = try await store.db.list(Meal.self, Query(eq: ["date": .string(asked)], orderBy: "time"))
            if asked == date {
                meals = rows
                loadError = nil
            }
        } catch is CancellationError {
            return
        } catch {
            note(error)
        }
        mealsLoaded = true
    }

    public func loadSaved() async {
        if let rows = try? await store.db.list(SavedMeal.self) { saved = rows }
    }

    public func loadLogs() async {
        do {
            bodyLogs = try await store.db.list(BodyLog.self, Query(orderBy: "date"))
        } catch is CancellationError {
            return
        } catch {
            note(error)
        }
        logsLoaded = true
    }

    /// Show another day.
    public func select(_ newDate: DateStr) async {
        let clamped = newDate > store.today ? store.today : newDate
        if clamped == date { return }
        date = clamped
        meals = []
        mealsLoaded = false
        await loadMeals()
    }

    // MARK: derived

    public var isToday: Bool { return date == store.today }

    public var editable: Bool {
        let installed = store.settings.map { LIDate.nyParts(iso: $0.createdAt).date }
        return LIDate.isDayEditable(date, now: Date(), installedOn: installed)
    }

    public var totals: BodyMacros { return BodyRules.mealTotals(meals) }

    public var weightUnit: String { return (store.settings?.weightUnit ?? .lb).rawValue }

    /// Calories and protein come from the checklist targets, carbs and fat from the settings budgets.
    public var goals: (calories: BodyGoal, protein: BodyGoal, carbs: BodyGoal, fat: BodyGoal) {
        func find(_ key: String) -> BodyGoal {
            guard let item = store.items.first(where: { $0.key == key }) else { return BodyGoal.none }
            return BodyRules.goalFromTarget(Targets.targetOn(item, store.versions, date))
        }
        return (find("calories"), find("protein"), BodyRules.budgetGoal(store.settings?.carbsTarget), BodyRules.budgetGoal(store.settings?.fatTarget))
    }

    public var favorites: [SavedMeal] {
        return saved.sorted { a, b in
            if a.useCount != b.useCount { return a.useCount > b.useCount }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
    }

    public var weighItem: ChecklistItem? { return store.items.first(where: { $0.key == "weighin" }) }

    public var window: BodyDayWindow {
        return BodyRules.dayWindow(store.mode, today: store.today, ongoingDays: 84)
    }

    public var today: DateStr { return store.today }

    public var weeklyDay: Int { return weighItem?.weeklyDay ?? 5 }

    // MARK: meals

    private func afterMealChange(_ day: DateStr) async {
        do {
            try await store.syncDayTotals(day)
        } catch {
            store.saveError = "Saved, but Today could not update. Pull down on Today to refresh."
        }
        await loadMeals()
        store.scheduleReload()
    }

    @discardableResult
    public func addMeal(_ input: BodyMealInput, on day: DateStr? = nil) async throws -> Meal {
        let d = day ?? date
        var row = input.tidy
        row["date"] = .string(d)
        row["time"] = .string(LIDate.timeNY())
        row["photo_url"] = JSON.str(input.photoUrl)
        let made = try await store.db.insert(Meal.self, row)
        await afterMealChange(d)
        return made
    }

    @discardableResult
    public func updateMeal(_ meal: Meal, _ input: BodyMealInput) async throws -> Meal {
        var patch = input.tidy
        if input.changesPhoto { patch["photo_url"] = JSON.str(input.photoUrl) }
        let made = try await store.db.update(Meal.self, id: meal.id, patch: patch)
        await afterMealChange(meal.date)
        return made
    }

    /// A photo is only deleted when no other meal or favorite still points at it.
    private func dropPhotoIfUnused(_ ref: String?) async {
        guard let ref = ref, !ref.isEmpty else { return }
        let meals = (try? await store.db.list(Meal.self, Query(eq: ["photo_url": .string(ref)]))) ?? []
        let favs = (try? await store.db.list(SavedMeal.self, Query(eq: ["photo_url": .string(ref)]))) ?? []
        if meals.isEmpty && favs.isEmpty { await MoneyBodyPhotos.remove(api: store.db.api, ref: ref) }
    }

    public func deleteMeal(_ meal: Meal) async throws {
        try await store.db.remove(Meal.self, id: meal.id)
        meals.removeAll { $0.id == meal.id }
        await afterMealChange(meal.date)
        await dropPhotoIfUnused(meal.photoUrl)
    }

    public func storeMealPhoto(_ jpeg: Data) async throws -> String {
        return try await MoneyBodyPhotos.upload(api: store.db.api, jpeg: jpeg, folder: "meals")
    }

    // MARK: favorites

    private func findSaved(_ name: String?) async -> SavedMeal? {
        guard let name = name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !name.isEmpty else { return nil }
        let all = (try? await store.db.list(SavedMeal.self)) ?? saved
        return all.first(where: { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == name })
    }

    /// Save a meal as a favorite. A favorite with the same name is updated.
    @discardableResult
    public func saveFavorite(_ input: BodyMealInput) async throws -> SavedMeal {
        var row = input.tidy
        let trimmed = (input.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let name = trimmed.isEmpty ? "Meal" : trimmed
        row["name"] = .string(name)
        let existing = await findSaved(name)
        row["photo_url"] = JSON.str(input.photoUrl ?? existing?.photoUrl)
        let made: SavedMeal
        if let existing = existing {
            made = try await store.db.update(SavedMeal.self, id: existing.id, patch: row)
        } else {
            row["use_count"] = .int(0)
            made = try await store.db.insert(SavedMeal.self, row)
        }
        await loadSaved()
        return made
    }

    public func removeFavorite(_ meal: SavedMeal) async throws {
        try await store.db.remove(SavedMeal.self, id: meal.id)
        saved.removeAll { $0.id == meal.id }
        await dropPhotoIfUnused(meal.photoUrl)
    }

    /// Log a favorite on the day on screen in one step.
    @discardableResult
    public func logFavorite(_ meal: SavedMeal) async throws -> Meal {
        let input = BodyMealInput(name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, photoUrl: meal.photoUrl, changesPhoto: true)
        let made = try await addMeal(input)
        _ = try? await store.db.update(SavedMeal.self, id: meal.id, patch: ["use_count": .int(meal.useCount + 1)])
        await loadSaved()
        return made
    }

    // MARK: meal photo estimate

    private static func noDashes(_ text: String) -> String {
        var out = ""
        for ch in text {
            if ch == "\u{2012}" || ch == "\u{2013}" || ch == "\u{2014}" || ch == "\u{2015}" {
                out += ","
            } else {
                out.append(ch)
            }
        }
        return out.replacingOccurrences(of: " ,", with: ",")
    }

    /// Ask the server to estimate a meal photo. Never throws: any trouble is a fallback.
    public func estimate(_ jpeg: Data) async -> BodyEstimateResult {
        do {
            let body = try JSONEncoder().encode(["image": MoneyBodyPhotos.dataURL(jpeg)])
            let (data, status) = try await store.db.api.send(path: "/api/body/meal-estimate", method: "POST", body: body)
            if !(200..<300).contains(status) { return .fallback }
            guard let json = try? JSONDecoder().decode(JSON.self, from: data), case .object(let o) = json else { return .fallback }
            guard o["source"]?.stringValue == "ai", let est = o["estimate"], case .object(let e) = est else { return .fallback }
            func num(_ key: String) -> Double {
                if let v = e[key], case .number(let n) = v, n.isFinite, n >= 0 { return n }
                return 0
            }
            return .estimate(BodyMealEstimate(
                name: BodyModel.noDashes(e["name"]?.stringValue ?? ""),
                calories: num("calories"),
                protein: num("protein"),
                carbs: num("carbs"),
                fat: num("fat"),
                note: BodyModel.noDashes(e["note"]?.stringValue ?? "")
            ))
        } catch {
            return .fallback
        }
    }

    // MARK: weight and progress photos

    /// Save a weigh-in, with or without a photo. Weight goes through logWeight.
    public func saveWeighIn(_ day: DateStr, weight: Double?, photo: Data?) async throws {
        let prev = try await store.db.first(BodyLog.self, Query(eq: ["date": .string(day)]))
        if prev == nil || weight != prev?.weight {
            try await store.logWeight(day, weight)
        }
        if let photo = photo {
            let ref = try await MoneyBodyPhotos.upload(api: store.db.api, jpeg: photo, folder: "body")
            let row = try await store.db.first(BodyLog.self, Query(eq: ["date": .string(day)]))
            _ = try await store.db.upsert(BodyLog.self, [
                "date": .string(day),
                "weight": JSON.num(row?.weight ?? weight),
                "photo_url": .string(ref),
            ], conflict: ["date"])
            if let old = prev?.photoUrl, old != ref { await MoneyBodyPhotos.remove(api: store.db.api, ref: old) }
        }
        await loadLogs()
        store.scheduleReload()
    }

    public func removeProgressPhoto(_ day: DateStr) async throws {
        guard let row = try await store.db.first(BodyLog.self, Query(eq: ["date": .string(day)])), let old = row.photoUrl else { return }
        _ = try await store.db.update(BodyLog.self, id: row.id, patch: ["photo_url": .null])
        await MoneyBodyPhotos.remove(api: store.db.api, ref: old)
        await loadLogs()
    }

    public func removeWeighIn(_ day: DateStr) async throws {
        guard let row = try await store.db.first(BodyLog.self, Query(eq: ["date": .string(day)])) else { return }
        try await store.logWeight(day, nil)
        if row.photoUrl == nil { try await store.db.remove(BodyLog.self, id: row.id) }
        await loadLogs()
        store.scheduleReload()
    }
}

// MARK: workout sets

/// Today's lift with per set weight and reps. Port of src/app/(app)/body/workout/page.tsx and the set helpers in data.ts.
@Observable
@MainActor
public final class WorkoutLogModel {
    @ObservationIgnored private let store: AppStore
    @ObservationIgnored private var saveTasks: [String: Task<Void, Never>] = [:]

    public private(set) var logs: [SetLog] = []
    public private(set) var loaded = false
    /// Edits to sets that are not logged yet. Keyed by exercise and set number.
    public private(set) var drafts: [String: SetValues] = [:]
    public var errorText: String? = nil

    /// How far back set history is read. Enough for a lift that comes round every few weeks.
    static let historyDays = 180

    public init(store: AppStore) {
        self.store = store
    }

    public var today: DateStr { return store.today }
    public var weightUnit: String { return (store.settings?.weightUnit ?? .lb).rawValue }
    public var main: Workout? { return store.mainWorkout }
    public var core: Workout? { return store.coreWorkout }

    public func load() async {
        let t = store.today
        do {
            logs = try await store.db.list(SetLog.self, Query(from: LIDate.addDays(t, -WorkoutLogModel.historyDays), to: t, orderBy: "date"))
        } catch is CancellationError {
            return
        } catch let error as APIError {
            errorText = error.isOffline ? "You look offline. Showing the last data." : (error.errorDescription ?? "Could not load.")
        } catch {
            errorText = "Could not load."
        }
        loaded = true
    }

    public var progress: WorkoutProgress {
        return Workouts.workoutProgress(Workouts.isLoggable(main) ? main : nil, logs: logs, date: store.today)
    }

    /// The next lifting day within a week, for the empty state.
    public var nextLift: (date: DateStr, workout: Workout)? {
        for i in 1...7 {
            let d = LIDate.addDays(store.today, i)
            let w = Workouts.workoutsFor(store.workouts, weekday: LIDate.weekdayOf(d)).main
            if let w = w, Workouts.isLoggable(w) { return (d, w) }
        }
        return nil
    }

    // MARK: per set state

    static func key(_ exercise: String, _ n: Int) -> String {
        return exercise.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() + "|" + String(n)
    }

    public func last(for exercise: Exercise) -> [SetLog] {
        return Workouts.lastSession(logs, exercise: exercise.name, before: store.today)
    }

    public func todayRows(for exercise: Exercise) -> [SetLog] {
        return Workouts.setsOn(logs, exercise: exercise.name, date: store.today)
    }

    public func row(for exercise: Exercise, _ n: Int) -> SetLog? {
        return todayRows(for: exercise).first(where: { $0.setNumber == n })
    }

    public func loggedCount(for exercise: Exercise) -> Int {
        return todayRows(for: exercise).filter { $0.setNumber >= 1 && $0.setNumber <= exercise.sets }.count
    }

    /// What the set shows: the logged numbers, else the draft, else what last session suggests.
    public func current(_ exercise: Exercise, _ n: Int) -> SetValues {
        if let r = row(for: exercise, n) { return SetValues(weight: r.weight, reps: r.reps) }
        if let d = drafts[WorkoutLogModel.key(exercise.name, n)] { return d }
        return Workouts.prefillSet(exercise, setNumber: n, last: last(for: exercise), today: todayRows(for: exercise))
    }

    public func lastText(for exercise: Exercise, _ n: Int) -> String {
        let v = last(for: exercise).first(where: { $0.setNumber == n })
        return Workouts.formatSet(v.map { SetValues(weight: $0.weight, reps: $0.reps) })
    }

    // MARK: edits

    public func setWeight(_ exercise: Exercise, _ n: Int, _ value: Double?) {
        change(exercise, n) { $0.weight = value }
    }

    public func setReps(_ exercise: Exercise, _ n: Int, _ value: Int?) {
        change(exercise, n) { $0.reps = value }
    }

    private func change(_ exercise: Exercise, _ n: Int, _ mutate: (inout SetValues) -> Void) {
        var next = current(exercise, n)
        mutate(&next)
        if let existing = row(for: exercise, n) {
            // A logged set saves as you type, a moment after the last key.
            if let i = logs.firstIndex(where: { $0.id == existing.id }) {
                logs[i].weight = next.weight
                logs[i].reps = next.reps
            }
            scheduleSave(exercise, n, next)
        } else {
            drafts[WorkoutLogModel.key(exercise.name, n)] = next
        }
    }

    private func scheduleSave(_ exercise: Exercise, _ n: Int, _ values: SetValues) {
        let k = WorkoutLogModel.key(exercise.name, n)
        saveTasks[k]?.cancel()
        let date = store.today
        let name = exercise.name
        saveTasks[k] = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 600_000_000)
            if Task.isCancelled { return }
            guard let self = self else { return }
            do {
                _ = try await self.persist(date, name, n, values)
            } catch {
                self.fail(error)
            }
        }
    }

    private func persist(_ date: DateStr, _ exercise: String, _ n: Int, _ values: SetValues) async throws -> SetLog {
        return try await store.db.upsert(SetLog.self, [
            "date": .string(date),
            "exercise": .string(exercise),
            "set_number": .int(n),
            "weight": JSON.num(values.weight),
            "reps": values.reps.map { JSON.int($0) } ?? JSON.null,
        ], conflict: ["date", "exercise", "set_number"])
    }

    private func fail(_ error: Error) {
        LIHaptics.error()
        if let api = error as? APIError {
            errorText = api.isOffline ? "Could not save the set. You look offline." : (api.errorDescription ?? "Could not save the set.")
        } else {
            errorText = "Could not save the set."
        }
    }

    /// Tap the circle: log the set, or take it back.
    public func toggle(_ exercise: Exercise, _ n: Int) {
        let date = store.today
        let k = WorkoutLogModel.key(exercise.name, n)
        if let existing = row(for: exercise, n) {
            saveTasks[k]?.cancel()
            drafts[k] = SetValues(weight: existing.weight, reps: existing.reps)
            logs.removeAll { $0.id == existing.id }
            LIHaptics.uncheck()
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                do {
                    let rows = try await self.store.db.list(SetLog.self, Query(eq: ["date": .string(date), "set_number": .int(n)]))
                    for r in rows where Workouts.sameExercise(r.exercise, exercise.name) {
                        try await self.store.db.remove(SetLog.self, id: r.id)
                    }
                } catch {
                    self.logs.append(existing)
                    self.fail(error)
                }
            }
            return
        }
        let values = current(exercise, n)
        if values.reps == nil && values.weight == nil {
            LIHaptics.error()
            errorText = "Enter the weight or reps first."
            return
        }
        let local = SetLog(id: "local:" + k, createdAt: LIDate.nowIso(), date: date, exercise: exercise.name, setNumber: n, weight: values.weight, reps: values.reps)
        logs.append(local)
        drafts[k] = nil
        LIHaptics.check()
        let name = exercise.name
        Task { @MainActor [weak self] in
            guard let self = self else { return }
            do {
                let saved = try await self.persist(date, name, n, values)
                if let i = self.logs.firstIndex(where: { $0.id == local.id }) { self.logs[i] = saved }
            } catch {
                self.logs.removeAll { $0.id == local.id }
                self.drafts[k] = values
                self.fail(error)
            }
        }
    }
}
