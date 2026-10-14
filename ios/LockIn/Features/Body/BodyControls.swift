import SwiftUI
import UIKit
import PhotosUI
import LockInKit

// Small controls shared by the Money and Body screens. Prefixed MB so they never collide with other features.

// MARK: number and text fields

/// A number field bound to an optional Double. Keeps what you are typing ("13.") while the bound value is 13.
struct MBNumberField: View {
    @Environment(\.liTheme) private var theme
    var label: String? = nil
    var unit: String? = nil
    var prefix: String? = nil
    var placeholder: String = "0"
    var decimal: Bool = true
    var hero: Bool = false
    var maxValue: Double = 99999
    var autofocus: Bool = false
    @Binding var value: Double?

    @State private var text: String = ""
    @FocusState private var focused: Bool

    static func show(_ v: Double?) -> String {
        guard let v = v else { return "" }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.usesGroupingSeparator = false
        f.locale = Locale(identifier: "en_US")
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: v)) ?? String(v)
    }

    private func parse(_ s: String) -> Double? {
        if s.isEmpty { return nil }
        return Double(s)
    }

    private func clean(_ s: String) -> String {
        var out = ""
        var seenDot = false
        var decimals = 0
        for ch in s {
            if ch.isASCII && ch.isNumber {
                if seenDot { decimals += 1 }
                if decimals > 2 { continue }
                out.append(ch)
            } else if decimal && (ch == "." || ch == ",") && !seenDot {
                seenDot = true
                out.append(".")
            }
        }
        if out.count > 9 { out = String(out.prefix(9)) }
        if let v = Double(out), v > maxValue { out = String(out.dropLast()) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label = label {
                Text(label).liType(.label).foregroundColor(theme.ink2)
            }
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                if let prefix = prefix {
                    Text(prefix).liType(hero ? .h1 : .value).foregroundColor(theme.accent)
                }
                TextField("", text: $text, prompt: Text(placeholder).foregroundColor(theme.ink3))
                    .keyboardType(decimal ? .decimalPad : .numberPad)
                    .focused($focused)
                    .liType(hero ? .num : .value)
                    .foregroundColor(theme.ink)
                    .tint(theme.accent)
                if let unit = unit {
                    Text(unit).liType(.sub).foregroundColor(theme.ink2)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: hero ? 76 : 52)
            .background(LITileSurface(radius: hero ? 24 : 16))
            .overlay(
                RoundedRectangle(cornerRadius: hero ? 24 : 16, style: .continuous)
                    .strokeBorder(focused ? theme.ink2 : Color.clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
        }
        .onAppear {
            text = MBNumberField.show(value)
            if autofocus {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { focused = true }
            }
        }
        .onChange(of: text) { _, new in
            let cleaned = clean(new)
            if cleaned != new {
                text = cleaned
                return
            }
            let parsed = parse(cleaned)
            if parsed != value { value = parsed }
        }
        .onChange(of: value) { _, new in
            if parse(text) != new { text = MBNumberField.show(new) }
        }
        .onChange(of: focused) { _, isFocused in
            if !isFocused { text = MBNumberField.show(value) }
        }
    }
}

struct MBTextField: View {
    @Environment(\.liTheme) private var theme
    var label: String? = nil
    var placeholder: String = ""
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label = label {
                Text(label).liType(.label).foregroundColor(theme.ink2)
            }
            TextField("", text: $text, prompt: Text(placeholder).foregroundColor(theme.ink3))
                .focused($focused)
                .liType(.body)
                .foregroundColor(theme.ink)
                .tint(theme.accent)
                .submitLabel(.done)
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .background(LITileSurface(radius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(focused ? theme.ink2 : Color.clear, lineWidth: 1)
                )
        }
    }
}

/// A date row bound to a YYYY-MM-DD string. The picker works in New York time like the rest of the app.
struct MBDateField: View {
    @Environment(\.liTheme) private var theme
    let label: String
    @Binding var date: DateStr
    var minDate: DateStr? = nil
    var maxDate: DateStr? = nil

    var body: some View {
        let low = LIDate.nyInstant(minDate ?? "2000-01-01", "00:00")
        let high = LIDate.nyInstant(maxDate ?? "2100-01-01", "23:59")
        let binding = Binding<Date>(
            get: { LIDate.nyInstant(date, "12:00") },
            set: { date = LIDate.nyParts($0).date }
        )
        HStack {
            Text(label).liType(.body).foregroundColor(theme.ink)
            Spacer()
            DatePicker("", selection: binding, in: low...high, displayedComponents: .date)
                .labelsHidden()
                .tint(theme.accent)
                .environment(\.timeZone, TimeZone(identifier: LIDate.timeZoneId) ?? TimeZone.current)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .background(LITileSurface(radius: 16))
    }
}

// MARK: sheet, toast, buttons

/// The frame of a bottom sheet: title, scrolling content, and a pinned footer.
struct MBSheet<Content: View, Footer: View>: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var subtitle: String? = nil
    let content: Content
    let footer: Footer

    init(title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
        self.footer = footer()
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).liType(.title).foregroundColor(theme.ink)
                if let subtitle = subtitle {
                    Text(subtitle).liType(.sub).foregroundColor(theme.ink2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 14)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    content
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
            .scrollDismissesKeyboard(.interactively)
            VStack(spacing: 0) {
                footer
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
        .background(theme.surface.ignoresSafeArea())
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                }
            }
        }
    }
}

/// A short message that slides up from the bottom and goes away by itself.
struct MBToastModifier: ViewModifier {
    @Environment(\.liTheme) private var theme
    @Binding var message: String?

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let message = message {
                Text(message)
                    .liType(.sub)
                    .foregroundColor(theme.ink)
                    .padding(.horizontal, 18)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(theme.surface3))
                    .overlay(Capsule().strokeBorder(theme.glassLine, lineWidth: 1))
                    .padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: message) {
                        try? await Task.sleep(nanoseconds: 2_200_000_000)
                        if !Task.isCancelled { self.message = nil }
                    }
            }
        }
        .animation(.easeOut(duration: 0.25), value: message)
    }
}

extension View {
    func mbToast(_ message: Binding<String?>) -> some View {
        return modifier(MBToastModifier(message: message))
    }
}

/// The round icon button: quiet, or the gradient one for the main action.
struct MBCircleLabel: View {
    @Environment(\.liTheme) private var theme
    let systemName: String
    var filled: Bool = false

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 18, weight: .regular))
            .foregroundColor(filled ? theme.accentInk : theme.ink)
            .frame(width: 46, height: 46)
            .background(
                Circle().fill(filled ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.tile))
            )
            .overlay(Circle().strokeBorder(filled ? Color.clear : theme.tileLine, lineWidth: 1))
    }
}

struct MBCircleButton: View {
    let systemName: String
    var filled: Bool = false
    let label: String
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            MBCircleLabel(systemName: systemName, filled: filled)
        }
        .buttonStyle(LIPressStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(label)
    }
}

/// A danger-toned text button for deletes.
struct MBDangerButton: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            Text(title)
                .liType(.body)
                .foregroundColor(theme.danger)
                .padding(.horizontal, 22)
                .frame(minHeight: 52)
                .background(Capsule().fill(theme.dangerSoft))
        }
        .buttonStyle(LIPressStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }
}

// MARK: rows

/// A tappable row inside a tile list: left accessory, title with a quiet line, right accessory, value.
struct MBRow: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var sub: String? = nil
    var value: String? = nil
    var valueTone: Color? = nil
    var left: AnyView? = nil
    var right: AnyView? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        if let action = action {
            Button(action: {
                LIHaptics.tap()
                action()
            }) {
                row
            }
            .buttonStyle(LIPressStyle())
        } else {
            row
        }
    }

    private var row: some View {
        HStack(spacing: 14) {
            if let left = left { left }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                if let sub = sub, !sub.isEmpty {
                    Text(sub).liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let right = right { right }
            if let value = value {
                Text(value).liType(.value).foregroundColor(valueTone ?? theme.ink)
            }
        }
        .padding(.horizontal, 18)
        .frame(minHeight: 62)
        .contentShape(Rectangle())
    }
}

/// Rows in one rounded tile, with a hairline between.
struct MBList<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .frame(maxWidth: .infinity)
        .background(LITileSurface(radius: 24))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

// MARK: rings

/// A ring that fills as the day goes. Warn colored once past a cap.
struct MBRing<Center: View>: View {
    @Environment(\.liTheme) private var theme
    let fill: Double
    var over: Bool = false
    var size: CGFloat = 76
    var stroke: CGFloat = 6
    let center: Center

    @State private var shown: Double = 0

    init(fill: Double, over: Bool = false, size: CGFloat = 76, stroke: CGFloat = 6, @ViewBuilder center: () -> Center) {
        self.fill = fill
        self.over = over
        self.size = size
        self.stroke = stroke
        self.center = center()
    }

    var body: some View {
        ZStack {
            Circle().stroke(theme.hair, lineWidth: stroke)
            if shown > 0.001 {
                Circle()
                    .trim(from: 0, to: CGFloat(Swift.min(1, shown)))
                    .stroke(over ? AnyShapeStyle(theme.warn) : AnyShapeStyle(theme.gradient), style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            center
        }
        .frame(width: size, height: size)
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) { shown = Swift.max(0, Swift.min(1, fill)) }
        }
        .onChange(of: fill) { _, new in
            withAnimation(.easeOut(duration: 0.6)) { shown = Swift.max(0, Swift.min(1, new)) }
        }
    }
}

// MARK: photos

/// A stored photo by its reference (a public URL). Nothing but a quiet tile for a missing or device-only photo.
struct MBRemoteImage: View {
    @Environment(\.liTheme) private var theme
    let ref: String?

    private var url: URL? {
        guard let ref = ref, !ref.isEmpty, !ref.hasPrefix("idb:") else { return nil }
        return URL(string: ref)
    }

    private var placeholder: some View {
        ZStack {
            theme.tile
            Image(systemName: "photo")
                .font(.system(size: 18, weight: .regular))
                .foregroundColor(theme.ink3)
        }
    }

    var body: some View {
        Color.clear.overlay(
            Group {
                if let url = url {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().scaledToFill()
                        case .failure:
                            placeholder
                        default:
                            ZStack {
                                theme.tile
                                ProgressView().tint(theme.ink3)
                            }
                        }
                    }
                } else {
                    placeholder
                }
            }
        )
        .clipped()
    }
}

/// The camera, as a full screen cover. Hands back the photo, or nil if cancelled.
struct MBCameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        return Coordinator(onImage: onImage)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (UIImage?) -> Void

        init(onImage: @escaping (UIImage?) -> Void) {
            self.onImage = onImage
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onImage(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onImage(nil)
        }
    }
}

/// Attach to a view: the photo library picker and the camera, each driven by a flag.
/// `onPhoto` gets a JPEG no longer than `maxSize` on its longest side.
struct MBPhotoSources: ViewModifier {
    @Binding var camera: Bool
    @Binding var library: Bool
    let maxSize: CGFloat
    let onPhoto: (Data) -> Void

    @State private var item: PhotosPickerItem? = nil

    func body(content: Content) -> some View {
        content
            .photosPicker(isPresented: $library, selection: $item, matching: .images)
            .fullScreenCover(isPresented: $camera) {
                MBCameraPicker { image in
                    camera = false
                    if let image = image, let jpeg = MoneyBodyPhotos.jpeg(from: image, maxSize: maxSize) {
                        onPhoto(jpeg)
                    }
                }
                .ignoresSafeArea()
            }
            .onChange(of: item) { _, picked in
                guard let picked = picked else { return }
                let size = maxSize
                Task {
                    let data = try? await picked.loadTransferable(type: Data.self)
                    await MainActor.run {
                        if let data = data, let jpeg = MoneyBodyPhotos.jpeg(from: data, maxSize: size) {
                            onPhoto(jpeg)
                        }
                        item = nil
                    }
                }
            }
    }
}

extension View {
    func mbPhotoSources(camera: Binding<Bool>, library: Binding<Bool>, maxSize: CGFloat, onPhoto: @escaping (Data) -> Void) -> some View {
        return modifier(MBPhotoSources(camera: camera, library: library, maxSize: maxSize, onPhoto: onPhoto))
    }
}

/// The menu behind a camera button: take a photo, or choose one.
struct MBPhotoMenu<LabelContent: View>: View {
    @Binding var camera: Bool
    @Binding var library: Bool
    let label: LabelContent

    init(camera: Binding<Bool>, library: Binding<Bool>, @ViewBuilder label: () -> LabelContent) {
        self._camera = camera
        self._library = library
        self.label = label()
    }

    var body: some View {
        Menu {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button(action: { camera = true }) {
                    Label("Take a photo", systemImage: "camera")
                }
            }
            Button(action: { library = true }) {
                Label("Choose from library", systemImage: "photo.on.rectangle")
            }
        } label: {
            label
        }
    }
}

// MARK: images from data

enum MBImage {
    static func ui(_ data: Data?) -> UIImage? {
        guard let data = data else { return nil }
        return UIImage(data: data)
    }
}
