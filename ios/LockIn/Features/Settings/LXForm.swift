import SwiftUI
import UIKit
import LockInKit

// Small form pieces shared by Meals, Boards and Settings. Prefixed LX so they never collide with another screen's helpers.

/// The look of a text entry: a quiet tile with a hairline.
struct LXShell<Content: View>: View {
    @Environment(\.liTheme) private var theme
    let label: String?
    let hint: String?
    let content: Content

    init(label: String? = nil, hint: String? = nil, @ViewBuilder content: () -> Content) {
        self.label = label
        self.hint = hint
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if let label = label {
                Text(label).liType(.sub).foregroundColor(theme.ink2)
            }
            HStack(spacing: 8) {
                content
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
            if let hint = hint {
                Text(hint).liType(.caption).foregroundColor(theme.ink2)
            }
        }
    }
}

struct LXField: View {
    @Environment(\.liTheme) private var theme
    let label: String?
    @Binding var text: String
    var placeholder: String = ""
    var hint: String? = nil
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .sentences
    var lines: Int = 1
    var onCommit: (() -> Void)? = nil

    var body: some View {
        LXShell(label: label, hint: hint) {
            if lines > 1 {
                TextField(text: $text, prompt: Text(placeholder).foregroundColor(theme.ink3), axis: .vertical) { Text(label ?? placeholder) }
                    .lineLimit(1...lines)
                    .liType(.body)
                    .foregroundColor(theme.ink)
                    .keyboardType(keyboard)
                    .textInputAutocapitalization(capitalization)
                    .padding(.vertical, 14)
            } else {
                TextField(text: $text, prompt: Text(placeholder).foregroundColor(theme.ink3)) { Text(label ?? placeholder) }
                    .liType(.body)
                    .foregroundColor(theme.ink)
                    .keyboardType(keyboard)
                    .textInputAutocapitalization(capitalization)
                    .submitLabel(.done)
                    .onSubmit { onCommit?() }
            }
        }
    }
}

/// A number that may be empty. Keeps what is typed and reports a value only when it parses.
struct LXNumberField: View {
    @Environment(\.liTheme) private var theme
    let label: String?
    @Binding var value: Double?
    var prefix: String? = nil
    var unit: String? = nil
    var placeholder: String = "0"
    var hint: String? = nil
    var decimal: Bool = true
    var onCommit: (() -> Void)? = nil

    @State private var text: String = ""
    @State private var loaded = false
    @FocusState private var focused: Bool

    private func show(_ v: Double?) -> String {
        guard let v = v else { return "" }
        return MealsCore.jsNum(v)
    }

    var body: some View {
        LXShell(label: label, hint: hint) {
            if let prefix = prefix {
                Text(prefix).liType(.body).foregroundColor(theme.ink2)
            }
            TextField(text: $text, prompt: Text(placeholder).foregroundColor(theme.ink3)) { Text(label ?? placeholder) }
                .liType(.body)
                .foregroundColor(theme.ink)
                .keyboardType(decimal ? .decimalPad : .numberPad)
                .focused($focused)
            if let unit = unit {
                Text(unit).liType(.sub).foregroundColor(theme.ink2)
            }
        }
        .onAppear {
            if !loaded {
                text = show(value)
                loaded = true
            }
        }
        .onChange(of: text) { _, new in
            let clean = new.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
            if clean.isEmpty {
                if value != nil { value = nil }
            } else if let d = Double(clean), d.isFinite {
                if value != d { value = d }
            }
        }
        .onChange(of: value) { _, new in
            if !focused { text = show(new) }
        }
        .onChange(of: focused) { _, now in
            if !now {
                text = show(value)
                onCommit?()
            }
        }
    }
}

struct LXToggleRow: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var sub: String? = nil
    @Binding var isOn: Bool

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).liType(.body).foregroundColor(theme.ink)
                if let sub = sub {
                    Text(sub).liType(.caption).foregroundColor(theme.ink2)
                }
            }
            Spacer(minLength: 8)
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(theme.accent)
                .onChange(of: isOn) { _, _ in LIHaptics.tap() }
        }
        .frame(minHeight: 44)
    }
}

/// A row that opens something: title, a line under it, a value and a chevron.
struct LXRow: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var sub: String? = nil
    var value: String? = nil
    var chevron: Bool = true

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                if let sub = sub {
                    Text(sub).liType(.caption).foregroundColor(theme.ink2).lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            if let value = value {
                Text(value).liType(.body).foregroundColor(theme.ink)
            }
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .regular)).foregroundColor(theme.ink3)
            }
        }
        .padding(.horizontal, 20)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
    }
}

/// A sheet with a title, a scrolling body and a pinned footer.
struct LXSheet<Content: View, Footer: View>: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let subtitle: String?
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
            VStack(alignment: .leading, spacing: 5) {
                Text(title).liType(.h1).foregroundColor(theme.ink).lineLimit(2)
                if let subtitle = subtitle {
                    Text(subtitle).liType(.sub).foregroundColor(theme.ink2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 26)
            .padding(.bottom, 14)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            footer
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 14)
        }
    }
}

extension LXSheet where Footer == EmptyView {
    init(title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.init(title: title, subtitle: subtitle, content: content, footer: { EmptyView() })
    }
}

/// A short message that rises from the bottom and goes by itself.
struct LXToastModifier: ViewModifier {
    @Environment(\.liTheme) private var theme
    @Binding var message: String?
    var warn: Bool = false

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let message = message {
                    Text(message)
                        .liType(.sub)
                        .foregroundColor(theme.ink)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(theme.surface3))
                        .overlay(Capsule().strokeBorder(theme.lineStrong, lineWidth: 1))
                        .padding(.horizontal, 24)
                        .padding(.bottom, 18)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .id(message)
                        .task {
                            try? await Task.sleep(nanoseconds: 2_800_000_000)
                            if self.message == message { self.message = nil }
                        }
                }
            }
            .animation(.easeOut(duration: 0.25), value: message)
    }
}

extension View {
    func lxToast(_ message: Binding<String?>) -> some View {
        return modifier(LXToastModifier(message: message))
    }
}

/// A time of day edited as "HH:mm".
struct LXTimeField: View {
    @Environment(\.liTheme) private var theme
    let label: String?
    @Binding var time: String
    var disabled: Bool = false

    private var date: Binding<Date> {
        Binding<Date>(
            get: {
                let mins = LIDate.isTimeStr(time) ? LIDate.minutesOf(time) : 0
                var c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
                c.hour = mins / 60
                c.minute = mins % 60
                return Calendar.current.date(from: c) ?? Date()
            },
            set: { d in
                let c = Calendar.current.dateComponents([.hour, .minute], from: d)
                time = LIDate.timeFromMinutes((c.hour ?? 0) * 60 + (c.minute ?? 0))
            }
        )
    }

    var body: some View {
        LXShell(label: label) {
            Text(LIDate.isTimeStr(time) ? LIDate.formatTime(time) : "Set a time").liType(.body).foregroundColor(theme.ink)
            Spacer(minLength: 0)
            DatePicker("", selection: date, displayedComponents: .hourAndMinute)
                .labelsHidden()
                .tint(theme.accent)
                .disabled(disabled)
        }
        .opacity(disabled ? 0.5 : 1)
    }
}

/// A calendar day edited as "YYYY-MM-DD".
struct LXDateField: View {
    @Environment(\.liTheme) private var theme
    let label: String?
    @Binding var day: String
    var min: String? = nil
    var max: String? = nil
    var hint: String? = nil

    private static func make(_ s: String) -> Date? {
        guard LIDate.isDateStr(s) else { return nil }
        let p = s.split(separator: "-").compactMap { Int($0) }
        if p.count != 3 { return nil }
        var c = DateComponents()
        c.year = p[0]
        c.month = p[1]
        c.day = p[2]
        c.hour = 12
        return Calendar.current.date(from: c)
    }

    private var date: Binding<Date> {
        Binding<Date>(
            get: { LXDateField.make(day) ?? Date() },
            set: { d in
                let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
                let y = c.year ?? 2026
                let m = c.month ?? 1
                let dd = c.day ?? 1
                day = String(format: "%04d-%02d-%02d", y, m, dd)
            }
        )
    }

    var body: some View {
        LXShell(label: label, hint: hint) {
            Text(LIDate.isDateStr(day) ? LIDate.formatDateLong(day) : "Pick a day").liType(.body).foregroundColor(theme.ink)
            Spacer(minLength: 0)
            if let lo = min.flatMap({ LXDateField.make($0) }), let hi = max.flatMap({ LXDateField.make($0) }) {
                DatePicker("", selection: date, in: lo...hi, displayedComponents: .date).labelsHidden().tint(theme.accent)
            } else if let lo = min.flatMap({ LXDateField.make($0) }) {
                DatePicker("", selection: date, in: lo..., displayedComponents: .date).labelsHidden().tint(theme.accent)
            } else if let hi = max.flatMap({ LXDateField.make($0) }) {
                DatePicker("", selection: date, in: ...hi, displayedComponents: .date).labelsHidden().tint(theme.accent)
            } else {
                DatePicker("", selection: date, displayedComponents: .date).labelsHidden().tint(theme.accent)
            }
        }
    }
}

/// A round icon button, 44pt.
struct LXIconButton: View {
    @Environment(\.liTheme) private var theme
    let systemName: String
    let label: String
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .regular))
                .foregroundColor(disabled ? theme.ink3 : theme.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(theme.tile))
                .overlay(Circle().strokeBorder(theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
        .disabled(disabled)
        .accessibilityLabel(label)
    }
}

/// A danger button in the same shape as the secondary one.
struct LXDangerButton: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var busy: Bool = false
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
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(theme.dangerSoft))
        }
        .buttonStyle(LIPressStyle())
        .disabled(busy)
    }
}

/// A secondary button that fills the row.
struct LXWideButton: View {
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
                .foregroundColor(disabled ? theme.ink3 : theme.ink)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(theme.tile))
                .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
        .disabled(disabled)
    }
}

/// A primary button that can be disabled.
struct LXPrimaryButton: View {
    @Environment(\.liTheme) private var theme
    let title: String
    var busy: Bool = false
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            ZStack {
                Text(title).liType(.body).opacity(busy ? 0 : 1)
                if busy { ProgressView().tint(theme.accentInk) }
            }
            .foregroundColor(theme.accentInk)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Capsule().fill(theme.gradient))
            .opacity(disabled ? 0.4 : 1)
        }
        .buttonStyle(LIPressStyle())
        .disabled(busy || disabled)
    }
}

/// Chips that wrap onto as many lines as they need.
struct LXFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width {
                x = 0
                y += rowH + spacing
                rowH = 0
            }
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX {
                x = bounds.minX
                y += rowH + spacing
                rowH = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}

/// Dollar text with "est." in front when the number is not a real price.
struct LXEst: View {
    @Environment(\.liTheme) private var theme
    let text: String
    var real: Bool = false
    var strong: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            if !real {
                Text("est.").liType(.label).foregroundColor(theme.ink2)
            }
            Text(text).foregroundColor(strong ? theme.ink : theme.ink)
        }
    }
}
