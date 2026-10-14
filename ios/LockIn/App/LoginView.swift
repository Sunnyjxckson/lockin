import SwiftUI
import LockInKit

/// Server address and passcode keypad, styled like the web lock screen.
struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.liTheme) private var theme
    let note: String?

    @State private var code = ""
    @State private var error: String? = nil
    @State private var busy = false
    @State private var shake = 0
    @State private var server = ""

    private let slots = 4

    private var greeting: String {
        let hour = LIDate.nyParts().hour
        if hour < 5 { return "Still up" }
        if hour < 12 { return "Good morning" }
        if hour < 18 { return "Good afternoon" }
        return "Good evening"
    }

    var body: some View {
        ZStack {
            LIBackground()
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Lock In").liType(.label).foregroundColor(theme.ink2)
                    Spacer()
                    Circle().fill(theme.gradient).frame(width: 36, height: 36)
                }
                .padding(.top, 8)

                VStack(alignment: .leading, spacing: 0) {
                    Text(greeting).liType(.label).foregroundColor(theme.ink2).padding(.top, 36)
                    Text("Enter passcode").liType(.greeting).foregroundColor(theme.ink).padding(.top, 12)
                    Text(error ?? note ?? "Then OK.")
                        .liType(.sub)
                        .foregroundColor(error != nil ? theme.danger : theme.ink2)
                        .frame(minHeight: 20, alignment: .leading)
                        .padding(.top, 12)
                    dots.padding(.top, 28)
                }
                .padding(.horizontal, 4)

                serverField.padding(.top, 24)

                Spacer(minLength: 16)

                LIKeypad(enabled: !busy, onDigit: { d in
                    error = nil
                    if code.count < 8 { code += d }
                }, onDelete: {
                    if !code.isEmpty { code.removeLast() }
                }, onSubmit: {
                    submit()
                })
                .padding(.bottom, 12)
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: 480)
        }
        .onAppear { server = session.serverText }
    }

    private var dots: some View {
        HStack(spacing: 14) {
            ForEach(0..<max(slots, code.count), id: \.self) { i in
                Circle()
                    .fill(i < code.count ? theme.ink : theme.tile)
                    .overlay(Circle().strokeBorder(i < code.count ? theme.ink : theme.tileLine, lineWidth: 1))
                    .frame(width: 14, height: 14)
                    .scaleEffect(i < code.count ? 1.1 : 1)
                    .animation(.easeOut(duration: 0.15), value: code.count)
            }
        }
        .modifier(ShakeEffect(travel: CGFloat(shake)))
        .animation(.linear(duration: 0.4), value: shake)
        .frame(height: 16)
    }

    private var serverField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Server").liType(.label).foregroundColor(theme.ink2).padding(.horizontal, 4)
            TextField("https://your-app.vercel.app", text: $server)
                .liType(.sub)
                .foregroundColor(theme.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .keyboardType(.URL)
                .padding(.horizontal, 16)
                .frame(minHeight: 48)
                .background(LITileSurface(radius: 16))
        }
    }

    private func submit() {
        if busy || code.count < 4 { return }
        busy = true
        let attempt = code
        let text = server
        Task {
            let result = await session.login(passcode: attempt, serverText: text)
            busy = false
            if let result = result {
                LIHaptics.error()
                error = result
                code = ""
                shake += 1
            }
        }
    }
}

/// A horizontal shake that settles back to rest.
struct ShakeEffect: GeometryEffect {
    var travel: CGFloat

    var animatableData: CGFloat {
        get { return travel }
        set { travel = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        return ProjectionTransform(CGAffineTransform(translationX: 8 * sin(travel * .pi * 4), y: 0))
    }
}

struct LIKeypad: View {
    @Environment(\.liTheme) private var theme
    let enabled: Bool
    let onDigit: (String) -> Void
    let onDelete: () -> Void
    let onSubmit: () -> Void

    private let rows: [[String]] = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]

    var body: some View {
        VStack(spacing: 14) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 14) {
                    ForEach(row, id: \.self) { d in
                        digitKey(d)
                    }
                }
            }
            HStack(spacing: 14) {
                iconKey(systemName: "delete.left", label: "Delete", action: onDelete)
                digitKey("0")
                iconKey(systemName: "checkmark", label: "OK", action: onSubmit)
            }
        }
    }

    private func digitKey(_ d: String) -> some View {
        Button(action: {
            LIHaptics.tap()
            onDigit(d)
        }) {
            Text(d)
                .liType(.numSm)
                .foregroundColor(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 68)
                .background(Circle().fill(theme.tile))
                .overlay(Circle().strokeBorder(theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
        .disabled(!enabled)
    }

    private func iconKey(systemName: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .regular))
                .foregroundColor(theme.ink)
                .frame(maxWidth: .infinity, minHeight: 68)
                .contentShape(Rectangle())
        }
        .buttonStyle(LIPressStyle())
        .accessibilityLabel(label)
        .disabled(!enabled)
    }
}
