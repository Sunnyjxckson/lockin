import SwiftUI
import LockInKit

/// Log a weigh-in, with an optional progress photo.
struct BodyWeighInSheet: View {
    @Environment(\.liTheme) private var theme

    let model: BodyModel
    let today: DateStr
    let unit: String
    let onClose: (String?) -> Void

    @State private var date: DateStr
    @State private var weight: Double?
    @State private var photo: Data? = nil
    @State private var busy = false
    @State private var errorText: String? = nil
    @State private var camera = false
    @State private var library = false

    init(model: BodyModel, initialDate: DateStr, initialWeight: Double?, today: DateStr, unit: String, onClose: @escaping (String?) -> Void) {
        self.model = model
        self.today = today
        self.unit = unit
        self.onClose = onClose
        _date = State(initialValue: initialDate)
        _weight = State(initialValue: initialWeight)
    }

    private var existing: BodyLog? {
        return model.bodyLogs.first(where: { $0.date == date })
    }

    private var canSave: Bool {
        return !busy && (weight != nil || photo != nil)
    }

    var body: some View {
        MBSheet(title: "Weigh-in", subtitle: "In the morning, before you eat.") {
            MBNumberField(unit: unit, hero: true, maxValue: 999, autofocus: existing == nil, value: $weight)
            MBDateField(label: "Date", date: $date, maxDate: today)
            photoSection
            Text("Same spot, same light, same pose.").liType(.caption).foregroundColor(theme.ink2)
            if let errorText = errorText {
                Text(errorText).liType(.sub).foregroundColor(theme.warn)
            }
        } footer: {
            HStack(spacing: 10) {
                if let row = existing, row.weight != nil {
                    MBDangerButton(title: "Delete", disabled: busy) {
                        run("Weigh-in removed") { try await model.removeWeighIn(date) }
                    }
                }
                LIPrimaryButton("Save", busy: busy) {
                    let day = date
                    let value = weight
                    let data = photo
                    run("Weigh-in saved") { try await model.saveWeighIn(day, weight: value, photo: data) }
                }
                .disabled(!canSave)
                .opacity(canSave ? 1 : 0.45)
            }
        }
        .onChange(of: date) { _, newDate in
            weight = model.bodyLogs.first(where: { $0.date == newDate })?.weight
            photo = nil
        }
        .mbPhotoSources(camera: $camera, library: $library, maxSize: 1600) { data in
            photo = data
        }
    }

    // MARK: photo

    @ViewBuilder
    private var photoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Progress photo").liType(.sub).foregroundColor(theme.ink2)
            if let image = MBImage.ui(photo) {
                HStack(alignment: .bottom, spacing: 14) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 112, height: 150)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    VStack(alignment: .leading, spacing: 6) {
                        MBPhotoMenu(camera: $camera, library: $library) {
                            pill("Replace")
                        }
                        Button(action: {
                            LIHaptics.tap()
                            photo = nil
                        }) {
                            Text("Remove").liType(.sub).foregroundColor(theme.ink2).frame(minHeight: 36)
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
            } else if let row = existing, let ref = row.photoUrl, !ref.isEmpty {
                HStack(alignment: .bottom, spacing: 14) {
                    MBRemoteImage(ref: ref)
                        .frame(width: 112, height: 150)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    VStack(alignment: .leading, spacing: 6) {
                        MBPhotoMenu(camera: $camera, library: $library) {
                            pill("Replace")
                        }
                        Button(action: {
                            LIHaptics.tap()
                            let day = date
                            run("Photo removed") { try await model.removeProgressPhoto(day) }
                        }) {
                            Text("Remove").liType(.sub).foregroundColor(theme.ink2).frame(minHeight: 36)
                        }
                        .buttonStyle(LIPressStyle())
                        .disabled(busy)
                    }
                }
            } else {
                MBPhotoMenu(camera: $camera, library: $library) {
                    HStack(spacing: 8) {
                        Image(systemName: "camera")
                            .font(.system(size: 16, weight: .regular))
                        Text("Add a photo").liType(.body)
                    }
                    .foregroundColor(theme.ink)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Capsule().fill(theme.tile))
                    .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
                }
            }
        }
    }

    private func pill(_ title: String) -> some View {
        Text(title)
            .liType(.sub)
            .foregroundColor(theme.ink)
            .padding(.horizontal, 18)
            .frame(minHeight: 40)
            .background(Capsule().fill(theme.tile))
            .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
    }

    // MARK: writes

    private func run(_ done: String, _ work: @escaping () async throws -> Void) {
        if busy { return }
        busy = true
        errorText = nil
        Task {
            do {
                try await work()
                LIHaptics.celebrate()
                onClose(done)
            } catch {
                LIHaptics.error()
                errorText = "Could not save. Try again."
                busy = false
            }
        }
    }
}
