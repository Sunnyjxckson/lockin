import SwiftUI
import LockInKit

private enum BodyReadState: Equatable {
    case idle
    case reading
    case estimated
    case fallback
}

/// Add or edit a meal. A photo is estimated by the server and fills the numbers, which stay editable.
struct BodyMealSheet: View {
    @Environment(\.liTheme) private var theme

    let model: BodyModel
    let state: BodyMealSheetState
    let day: DateStr
    let onClose: (String?) -> Void

    @State private var name: String
    @State private var calories: Double?
    @State private var protein: Double?
    @State private var carbs: Double?
    @State private var fat: Double?
    @State private var favorite = false
    @State private var photo: Data?
    @State private var read: BodyReadState = .idle
    @State private var readToken = 0
    @State private var note = ""
    @State private var touched = false
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var started = false
    @State private var camera = false
    @State private var library = false

    init(model: BodyModel, state: BodyMealSheetState, day: DateStr, onClose: @escaping (String?) -> Void) {
        self.model = model
        self.state = state
        self.day = day
        self.onClose = onClose
        switch state.mode {
        case .edit(let meal):
            _name = State(initialValue: meal.name ?? "")
            _calories = State(initialValue: meal.calories)
            _protein = State(initialValue: meal.protein)
            _carbs = State(initialValue: meal.carbs)
            _fat = State(initialValue: meal.fat)
            _photo = State(initialValue: nil)
        case .new(let data):
            _name = State(initialValue: "")
            _calories = State(initialValue: nil)
            _protein = State(initialValue: nil)
            _carbs = State(initialValue: nil)
            _fat = State(initialValue: nil)
            _photo = State(initialValue: data)
        }
    }

    private var editing: Meal? {
        if case .edit(let meal) = state.mode { return meal }
        return nil
    }

    private var initialPhoto: Data? {
        if case .new(let data) = state.mode { return data }
        return nil
    }

    private var isEmpty: Bool {
        return calories == nil && protein == nil && carbs == nil && fat == nil
    }

    private var canSave: Bool {
        return !busy && read != .reading && !isEmpty
    }

    private var title: String {
        if editing != nil { return "Edit meal" }
        return photo != nil ? "Snap a meal" : "Add a meal"
    }

    // Typing marks the numbers as yours, so a late estimate never overwrites them.
    private func touching(_ binding: Binding<Double?>) -> Binding<Double?> {
        return Binding<Double?>(
            get: { binding.wrappedValue },
            set: { newValue in
                touched = true
                binding.wrappedValue = newValue
            }
        )
    }

    private var nameBinding: Binding<String> {
        return Binding<String>(
            get: { name },
            set: { newValue in
                touched = true
                name = newValue
            }
        )
    }

    var body: some View {
        MBSheet(title: title) {
            photoBlock
            if read == .estimated {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(theme.accent)
                        .padding(.top, 2)
                    Text("Estimated from the photo. Fix what looks off. \(note)")
                        .liType(.sub)
                        .foregroundColor(theme.ink2)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LITileSurface(radius: 16))
            }
            if read == .fallback {
                Text("Photo estimates are off. The photo is attached. Type the numbers.")
                    .liType(.sub)
                    .foregroundColor(theme.ink2)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(LITileSurface(radius: 16))
            }
            MBNumberField(label: "Calories", unit: "kcal", decimal: false, hero: true, maxValue: 9999, value: touching($calories))
            MBTextField(label: "Name", placeholder: "Chicken and rice", text: nameBinding)
            HStack(alignment: .top, spacing: 10) {
                MBNumberField(label: "Protein", unit: "g", maxValue: 999, value: touching($protein))
                MBNumberField(label: "Carbs", unit: "g", maxValue: 999, value: touching($carbs))
                MBNumberField(label: "Fat", unit: "g", maxValue: 999, value: touching($fat))
            }
            HStack {
                HStack(spacing: 10) {
                    Image(systemName: "star")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundColor(theme.ink2)
                    Text("Save as a favorite").liType(.body).foregroundColor(theme.ink)
                }
                Spacer()
                Toggle("", isOn: $favorite)
                    .labelsHidden()
                    .tint(theme.accent)
            }
            .frame(minHeight: 52)
            .padding(.horizontal, 4)
            if let errorText = errorText {
                Text(errorText).liType(.sub).foregroundColor(theme.warn)
            }
        } footer: {
            HStack(spacing: 10) {
                if let meal = editing {
                    MBDangerButton(title: "Delete", disabled: busy) { remove(meal) }
                }
                LIPrimaryButton(editing != nil ? "Save" : "Log meal", busy: busy) { save() }
                    .disabled(!canSave)
                    .opacity(canSave ? 1 : 0.45)
            }
        }
        .mbPhotoSources(camera: $camera, library: $library, maxSize: 1280) { data in
            attach(data)
        }
        .task {
            if started { return }
            started = true
            if let data = initialPhoto { attach(data) }
        }
    }

    // MARK: photo

    @ViewBuilder
    private var photoBlock: some View {
        if let image = MBImage.ui(photo) {
            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity)
                    .frame(height: 190)
                    .clipped()
                if read == .reading {
                    ZStack {
                        Color.black.opacity(0.5)
                        HStack(spacing: 10) {
                            ProgressView().tint(Color.white)
                            Text("Reading the photo").liType(.sub).foregroundColor(Color.white)
                        }
                    }
                }
            }
            .frame(height: 190)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else if let meal = editing, let ref = meal.photoUrl, !ref.isEmpty {
            MBRemoteImage(ref: ref)
                .frame(height: 190)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else if editing == nil {
            MBPhotoMenu(camera: $camera, library: $library) {
                HStack(spacing: 8) {
                    Image(systemName: "camera")
                        .font(.system(size: 16, weight: .regular))
                    Text("Add a photo to estimate it").liType(.body)
                }
                .foregroundColor(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(theme.tile))
                .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
            }
        }
    }

    private func attach(_ data: Data) {
        photo = data
        read = .reading
        readToken += 1
        let token = readToken
        Task {
            let small = MoneyBodyPhotos.jpeg(from: data, maxSize: 1024, quality: 0.8) ?? data
            let result = await model.estimate(small)
            if token != readToken { return }
            switch result {
            case .estimate(let e):
                // Never overwrite what was typed while the photo was being read.
                if !touched {
                    name = e.name
                    calories = e.calories
                    protein = e.protein
                    carbs = e.carbs
                    fat = e.fat
                }
                note = e.note
                read = .estimated
                LIHaptics.tap()
            case .fallback:
                read = .fallback
            }
        }
    }

    // MARK: writes

    private func save() {
        if !canSave { return }
        busy = true
        errorText = nil
        let values = BodyMealInput(
            name: name,
            calories: calories ?? 0,
            protein: protein ?? 0,
            carbs: carbs ?? 0,
            fat: fat ?? 0
        )
        let data = photo
        let wantsFavorite = favorite
        let prev = editing
        Task {
            do {
                var input = values
                if let data = data {
                    input.photoUrl = try await model.storeMealPhoto(data)
                    input.changesPhoto = true
                } else if prev == nil {
                    input.photoUrl = nil
                    input.changesPhoto = true
                }
                if let prev = prev {
                    try await model.updateMeal(prev, input)
                } else {
                    try await model.addMeal(input, on: day)
                }
                if wantsFavorite {
                    var fav = values
                    fav.photoUrl = input.changesPhoto ? input.photoUrl : prev?.photoUrl
                    try await model.saveFavorite(fav)
                }
                LIHaptics.celebrate()
                onClose(wantsFavorite ? "Saved, and added to favorites" : (prev != nil ? "Meal updated" : "Meal logged"))
            } catch {
                LIHaptics.error()
                errorText = "Could not save the meal. Try again."
                busy = false
            }
        }
    }

    private func remove(_ meal: Meal) {
        if busy { return }
        busy = true
        Task {
            do {
                try await model.deleteMeal(meal)
                onClose("Meal deleted")
            } catch {
                LIHaptics.error()
                errorText = "Could not delete the meal. Try again."
                busy = false
            }
        }
    }
}
