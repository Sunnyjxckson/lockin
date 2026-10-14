import SwiftUI
import LockInKit

struct BodyView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        BodyScreen(store: store)
    }
}

private enum BodyTab: Hashable {
    case food
    case weight
}

struct BodyScreen: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase

    @State private var model: BodyModel
    @State private var tab: BodyTab = .food
    @State private var toast: String? = nil

    init(store: AppStore) {
        _model = State(initialValue: BodyModel(store: store))
    }

    var body: some View {
        ZStack {
            if store.hasData {
                content
            } else {
                firstLoad
            }
        }
        .task {
            if !store.hasData { await store.reload() }
            await model.load()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
    }

    @ViewBuilder
    private var firstLoad: some View {
        ZStack {
            LIBackground()
            switch store.loadState {
            case .failed(let message, let offline):
                LIEmptyState(
                    title: offline ? "You look offline" : "Could not load",
                    message: offline ? "Lock In needs the server for the first load." : message,
                    actionTitle: "Try again",
                    action: { Task { await store.reload() } }
                )
                .padding(.horizontal, 20)
            case .loaded:
                LIEmptyState(title: "Nothing set up yet", message: "Open Lock In on the web once, then pull down here.")
                    .padding(.horizontal, 20)
            default:
                ProgressView().tint(theme.ink2)
            }
        }
    }

    private var content: some View {
        LIScreen {
            Text("Body")
                .liType(.title)
                .foregroundColor(theme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 16)
                .padding(.bottom, 8)
            if let error = model.loadError {
                LINotice(error, actionTitle: "Retry") { Task { await model.load() } }
                    .padding(.bottom, 8)
            }
            LISegmentedControl(options: [(value: BodyTab.food, title: "Food"), (value: BodyTab.weight, title: "Weight")], selection: $tab)
                .padding(.top, 4)
            switch tab {
            case .food:
                BodyFoodTab(model: model, toast: $toast)
            case .weight:
                BodyWeightTab(model: model, toast: $toast)
            }
            workoutRow
                .padding(.top, 30)
        }
        .refreshable {
            await model.load()
            await store.reload()
        }
        .mbToast($toast)
    }

    // MARK: workout entry

    private var workoutRow: some View {
        let main = store.mainWorkout
        let loggable = Workouts.isLoggable(main)
        let progress = Workouts.workoutProgress(loggable ? main : nil, logs: model.todaySets, date: store.today)
        return VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Workout")
            NavigationLink(destination: WorkoutLogScreen(store: store)) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Log workout").liType(.body).foregroundColor(theme.ink)
                        Text(workoutLine(main, loggable: loggable))
                            .liType(.caption)
                            .foregroundColor(theme.ink2)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if loggable && progress.total > 0 {
                        Text("\(progress.logged)/\(progress.total)")
                            .liType(.value)
                            .foregroundColor(progress.complete ? theme.accent : theme.ink)
                        Text("sets").liType(.caption).foregroundColor(theme.ink2)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(theme.ink3)
                }
                .padding(.horizontal, 18)
                .frame(minHeight: 68)
                .background(LITileSurface(radius: 20))
                .contentShape(Rectangle())
            }
            .buttonStyle(LIPressStyle())
        }
    }

    private func workoutLine(_ main: Workout?, loggable: Bool) -> String {
        guard let main = main else { return "No workout set for today" }
        return loggable ? main.name : "\(main.name) today, nothing to log"
    }
}

// MARK: food

struct BodyMealSheetState: Identifiable {
    enum Mode {
        case new(Data?)
        case edit(Meal)
    }

    let id = UUID()
    let mode: Mode
}

struct BodyFoodTab: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme

    let model: BodyModel
    @Binding var toast: String?

    @State private var mealSheet: BodyMealSheetState? = nil
    @State private var camera = false
    @State private var library = false
    @State private var managing = false
    @State private var logging: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            daySwitcher
                .padding(.top, 10)
            ringsCard
                .padding(.top, 8)
            eatenCard
                .padding(.top, 20)
            mealsSection
                .padding(.top, 28)
            favoritesSection
                .padding(.top, 28)
        }
        .mbPhotoSources(camera: $camera, library: $library, maxSize: 1280) { data in
            mealSheet = BodyMealSheetState(mode: .new(data))
        }
        .sheet(item: $mealSheet) { state in
            BodyMealSheet(model: model, state: state, day: model.date, onClose: { message in
                mealSheet = nil
                if let message = message { toast = message }
            })
            .liSheetStyle()
            .presentationDetents([.large])
        }
    }

    // MARK: day switcher

    private var daySwitcher: some View {
        HStack {
            Button(action: {
                LIHaptics.tap()
                Task { await model.select(LIDate.addDays(model.date, -1)) }
            }) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(theme.ink2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Previous day")
            Spacer()
            Button(action: {
                LIHaptics.tap()
                Task { await model.select(store.today) }
            }) {
                Text(model.isToday ? "Today" : LIDate.formatDateLong(model.date))
                    .liType(.label)
                    .foregroundColor(theme.ink)
                    .frame(minHeight: 44)
            }
            .buttonStyle(LIPressStyle())
            .disabled(model.isToday)
            Spacer()
            Button(action: {
                LIHaptics.tap()
                Task { await model.select(LIDate.addDays(model.date, 1)) }
            }) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(theme.ink2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .disabled(model.isToday)
            .opacity(model.isToday ? 0.3 : 1)
            .accessibilityLabel("Next day")
        }
    }

    // MARK: rings

    private var ringsCard: some View {
        let totals = model.totals
        let goals = model.goals
        let cal = BodyRules.ringFor(totals.calories, goals.calories)
        let rem = BodyRules.remainingFor(totals.calories, goals.calories)
        let over = cal.state == .over
        let met = cal.state == .met
        let none = cal.state == .none
        let value: Double = none ? totals.calories : (over ? rem.over : (met ? (rem.room ?? 0) : rem.left))
        let label = none ? "Eaten" : (over ? "Over the range" : (met ? "In range, room left" : "Left to eat"))
        return LICard(feature: true) {
            VStack(spacing: 22) {
                MBRing(fill: cal.fill, over: over, size: 188, stroke: 12) {
                    VStack(spacing: 2) {
                        Text(label)
                            .liType(.label)
                            .foregroundColor(over ? theme.warn : (met ? theme.accent : theme.ink2))
                            .multilineTextAlignment(.center)
                        Text(BodyRules.fmt(value))
                            .liType(.num)
                            .foregroundColor(theme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text("kcal").liType(.sub).foregroundColor(theme.ink2)
                    }
                    .padding(.horizontal, 22)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(label), \(BodyRules.fmt(value)) calories")
                Text(none ? "No calorie target set." : "Target \(BodyRules.targetLine(goals.calories, unit: "kcal")).")
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
                HStack(alignment: .top, spacing: 8) {
                    macroRing("Protein", total: totals.protein, goal: goals.protein)
                    macroRing("Carbs", total: totals.carbs, goal: goals.carbs)
                    macroRing("Fat", total: totals.fat, goal: goals.fat)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func macroRing(_ name: String, total: Double, goal: BodyGoal) -> some View {
        let ring = BodyRules.ringFor(total, goal)
        let over = ring.state == .over
        let caption = BodyRules.remainingLabel(total, goal, unit: "g")
        return VStack(spacing: 8) {
            MBRing(fill: ring.fill, over: over, size: 78, stroke: 6) {
                VStack(spacing: 0) {
                    Text(BodyRules.fmt(total)).liType(.value).foregroundColor(theme.ink)
                    Text("g").liType(.caption).foregroundColor(theme.ink2)
                }
            }
            VStack(spacing: 2) {
                Text(name).liType(.label).foregroundColor(theme.ink2)
                Text(caption)
                    .liType(.caption)
                    .foregroundColor(over ? theme.warn : (ring.state == .met ? theme.accent : theme.ink2))
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name): \(BodyRules.fmt(total)) grams, \(caption)")
    }

    // MARK: eaten

    private var eatenCard: some View {
        LICard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Eaten").liType(.label).foregroundColor(theme.ink2)
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(BodyRules.fmt(model.totals.calories)).liType(.h1).foregroundColor(theme.ink)
                            Text("kcal").liType(.sub).foregroundColor(theme.ink2)
                        }
                    }
                    Spacer(minLength: 8)
                    if model.editable {
                        HStack(spacing: 10) {
                            MBPhotoMenu(camera: $camera, library: $library) {
                                MBCircleLabel(systemName: "camera")
                            }
                            .accessibilityLabel("Snap a meal")
                            MBCircleButton(systemName: "plus", filled: true, label: "Add by hand") {
                                mealSheet = BodyMealSheetState(mode: .new(nil))
                            }
                        }
                    } else {
                        HStack(spacing: 6) {
                            Image(systemName: "lock").font(.system(size: 12, weight: .regular))
                            Text("Locked").liType(.label)
                        }
                        .foregroundColor(theme.ink2)
                    }
                }
                if !model.editable {
                    Text("Meals can change until noon the next day.").liType(.sub).foregroundColor(theme.ink2)
                }
            }
        }
    }

    // MARK: meals

    private func mealTap(_ m: Meal) -> (() -> Void)? {
        if !model.editable { return nil }
        return { mealSheet = BodyMealSheetState(mode: .edit(m)) }
    }

    private func macroLine(_ protein: Double, _ carbs: Double, _ fat: Double) -> String {
        return "P \(BodyRules.fmt(protein))  C \(BodyRules.fmt(carbs))  F \(BodyRules.fmt(fat))"
    }

    private func thumb(_ ref: String?) -> AnyView? {
        guard let ref = ref, !ref.isEmpty else { return nil }
        return AnyView(
            MBRemoteImage(ref: ref)
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        )
    }

    private var mealsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Meals", trailing: model.meals.isEmpty ? nil : String(model.meals.count))
            if model.meals.isEmpty {
                if model.mealsLoaded {
                    LICard {
                        LIEmptyState(
                            title: model.isToday ? "Nothing eaten yet" : "No meals logged",
                            message: model.editable ? "Snap a photo or add a meal by hand." : nil
                        )
                    }
                }
            } else {
                MBList {
                    ForEach(0..<model.meals.count, id: \.self) { i in
                        let m = model.meals[i]
                        if i > 0 { LIHairline() }
                        MBRow(
                            title: (m.name ?? "").isEmpty ? "Meal" : (m.name ?? "Meal"),
                            sub: "\(LIDate.formatTime(m.time)), \(macroLine(m.protein, m.carbs, m.fat))",
                            value: BodyRules.fmt(m.calories),
                            left: thumb(m.photoUrl),
                            action: mealTap(m)
                        )
                    }
                }
            }
        }
    }

    // MARK: favorites

    private var favoritesSection: some View {
        let favorites = model.favorites
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Favorites").liType(.label).foregroundColor(theme.ink2)
                Spacer()
                if !favorites.isEmpty {
                    Button(action: {
                        LIHaptics.tap()
                        managing.toggle()
                    }) {
                        Text(managing ? "Done" : "Edit")
                            .liType(.label)
                            .foregroundColor(theme.ink)
                            .frame(minHeight: 32)
                    }
                    .buttonStyle(LIPressStyle())
                }
            }
            if favorites.isEmpty {
                LICard {
                    LIEmptyState(title: "No favorites yet", message: "Save a meal as one and it logs in a tap.")
                }
            } else {
                MBList {
                    ForEach(0..<favorites.count, id: \.self) { i in
                        let s = favorites[i]
                        if i > 0 { LIHairline() }
                        MBRow(
                            title: s.name,
                            sub: "\(BodyRules.fmt(s.calories)) kcal, \(macroLine(s.protein, s.carbs, s.fat))",
                            left: thumb(s.photoUrl),
                            right: AnyView(favoriteAction(s))
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func favoriteAction(_ s: SavedMeal) -> some View {
        if managing {
            Button(action: { remove(s) }) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(theme.danger)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Remove \(s.name) from favorites")
        } else {
            MBCircleButton(systemName: "plus", filled: true, label: "Log \(s.name)", disabled: !model.editable || logging == s.id) {
                relog(s)
            }
        }
    }

    private func relog(_ s: SavedMeal) {
        if logging != nil { return }
        logging = s.id
        Task {
            do {
                try await model.logFavorite(s)
                LIHaptics.celebrate()
                toast = "\(s.name) logged"
            } catch {
                LIHaptics.error()
                toast = "Could not log it"
            }
            logging = nil
        }
    }

    private func remove(_ s: SavedMeal) {
        Task {
            do {
                try await model.removeFavorite(s)
                toast = "Removed from favorites"
            } catch {
                LIHaptics.error()
                toast = "Could not remove it"
            }
        }
    }
}
