import SwiftUI

// MARK: backgrounds and surfaces

/// The page: the base color with three soft lights. Drawn once, behind everything.
public struct LIBackground: View {
    @Environment(\.liTheme) private var theme

    public init() {}

    public var body: some View {
        GeometryReader { geo in
            ZStack {
                theme.bg
                RadialGradient(colors: [theme.glow1.opacity(theme.fx.glow[0]), Color.clear], center: .topTrailing, startRadius: 0, endRadius: geo.size.width * 0.95)
                RadialGradient(colors: [theme.glow2.opacity(theme.fx.glow[1]), Color.clear], center: UnitPoint(x: 0.0, y: 0.22), startRadius: 0, endRadius: geo.size.width * 0.8)
                RadialGradient(colors: [theme.glow3.opacity(theme.fx.glow[2]), Color.clear], center: UnitPoint(x: 0.5, y: 1.05), startRadius: 0, endRadius: geo.size.width * 1.0)
            }
        }
        .ignoresSafeArea()
    }
}

/// A frosted glass fill with a hairline border. Use as a background.
public struct LIGlassSurface: View {
    @Environment(\.liTheme) private var theme
    let radius: CGFloat

    public init(radius: CGFloat = 26) {
        self.radius = radius
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(LinearGradient(colors: [theme.glassHi, theme.glassLo], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(theme.glassLine, lineWidth: 1)
            )
    }
}

/// A resting tile: the quiet fill used for rows and controls.
public struct LITileSurface: View {
    @Environment(\.liTheme) private var theme
    let radius: CGFloat

    public init(radius: CGFloat = 20) {
        self.radius = radius
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(theme.tile)
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(theme.tileLine, lineWidth: 1)
            )
    }
}

/// A card. `feature` is the glass card a screen leads with, otherwise a quiet tile.
public struct LICard<Content: View>: View {
    let feature: Bool
    let padding: CGFloat
    let content: Content

    public init(feature: Bool = false, padding: CGFloat = 20, @ViewBuilder content: () -> Content) {
        self.feature = feature
        self.padding = padding
        self.content = content()
    }

    public var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(feature ? AnyView(LIGlassSurface(radius: 26)) : AnyView(LITileSurface(radius: 24)))
    }
}

/// A hairline between rows.
public struct LIHairline: View {
    @Environment(\.liTheme) private var theme

    public init() {}

    public var body: some View {
        Rectangle().fill(theme.hair).frame(height: 1)
    }
}

// MARK: screen

/// Page wrapper: background, 20pt side padding, scrolling column.
public struct LIScreen<Content: View>: View {
    let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        ZStack {
            LIBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

// MARK: text pieces

/// The small uppercase tracked label that opens a group: "TODAY   7 OF 12".
public struct LISectionLabel: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let trailing: String?

    public init(_ title: String, trailing: String? = nil) {
        self.title = title
        self.trailing = trailing
    }

    public var body: some View {
        HStack {
            Text(title).liType(.label).foregroundColor(theme.ink2)
            Spacer()
            if let trailing = trailing {
                Text(trailing).liType(.label).foregroundColor(theme.ink2)
            }
        }
    }
}

public struct LIPageHeader: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let eyebrow: String?
    let subtitle: String?

    public init(_ title: String, eyebrow: String? = nil, subtitle: String? = nil) {
        self.title = title
        self.eyebrow = eyebrow
        self.subtitle = subtitle
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let eyebrow = eyebrow {
                Text(eyebrow).liType(.label).foregroundColor(theme.ink2)
            }
            Text(title).liType(.title).foregroundColor(theme.ink)
            if let subtitle = subtitle {
                Text(subtitle).liType(.sub).foregroundColor(theme.ink2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }
}

/// A big number with an optional raised prefix, a small unit and a label.
public struct LIBigNumber: View {
    @Environment(\.liTheme) private var theme
    let value: String
    let prefix: String?
    let unit: String?
    let label: String?
    let size: LIType

    public init(_ value: String, prefix: String? = nil, unit: String? = nil, label: String? = nil, size: LIType = .hero) {
        self.value = value
        self.prefix = prefix
        self.unit = unit
        self.label = label
        self.size = size
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label = label {
                Text(label).liType(.label).foregroundColor(theme.ink2)
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                if let prefix = prefix {
                    Text(prefix).liType(.h2).foregroundColor(theme.accent)
                }
                Text(value).liType(size).foregroundColor(theme.ink).lineLimit(1).minimumScaleFactor(0.6)
                if let unit = unit {
                    Text(unit).liType(.h2).foregroundColor(theme.ink2)
                }
            }
        }
    }
}

/// A number with its label above, for a row of stats.
public struct LIStat: View {
    @Environment(\.liTheme) private var theme
    let label: String
    let value: String
    let sub: String?

    public init(label: String, value: String, sub: String? = nil) {
        self.label = label
        self.value = value
        self.sub = sub
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).liType(.label).foregroundColor(theme.ink2)
            Text(value).liType(.stat).foregroundColor(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
            if let sub = sub {
                Text(sub).liType(.caption).foregroundColor(theme.ink2)
            }
        }
    }
}

// MARK: controls

/// The round tick. Gradient when done, a warn ring when logged but not counting, an empty ring otherwise.
public struct LICheckmark: View {
    @Environment(\.liTheme) private var theme
    let checked: Bool
    let off: Bool
    let size: CGFloat

    public init(checked: Bool, off: Bool = false, size: CGFloat = 28) {
        self.checked = checked
        self.off = off
        self.size = size
    }

    public var body: some View {
        ZStack {
            if checked {
                Circle().fill(theme.gradient)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundColor(theme.accentInk)
            } else if off {
                Circle().strokeBorder(theme.warn, lineWidth: 1.5)
                Image(systemName: "exclamationmark")
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundColor(theme.warn)
            } else {
                Circle().strokeBorder(theme.ink3.opacity(0.7), lineWidth: 1.5)
            }
        }
        .frame(width: size, height: size)
    }
}

/// A checklist row: tick on the left, name and a quiet line, anything extra on the right. Taps with a haptic.
public struct LICheckRow<Trailing: View>: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let sub: String?
    let checked: Bool
    let off: Bool
    let enabled: Bool
    let onToggle: () -> Void
    let trailing: Trailing

    public init(title: String, sub: String? = nil, checked: Bool, off: Bool = false, enabled: Bool = true, onToggle: @escaping () -> Void, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.sub = sub
        self.checked = checked
        self.off = off
        self.enabled = enabled
        self.onToggle = onToggle
        self.trailing = trailing()
    }

    public var body: some View {
        HStack(spacing: 14) {
            Button(action: {
                if checked { LIHaptics.uncheck() } else { LIHaptics.check() }
                onToggle()
            }) {
                HStack(spacing: 14) {
                    LICheckmark(checked: checked, off: off)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .liType(.body)
                            .foregroundColor(checked ? theme.ink2 : theme.ink)
                            .lineLimit(1)
                        if let sub = sub, !sub.isEmpty {
                            Text(sub).liType(.caption).foregroundColor(off ? theme.warn : theme.ink2).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(LIPressStyle())
            .disabled(!enabled)
            trailing
        }
        .padding(.horizontal, 18)
        .frame(minHeight: 58)
    }
}

extension LICheckRow where Trailing == EmptyView {
    public init(title: String, sub: String? = nil, checked: Bool, off: Bool = false, enabled: Bool = true, onToggle: @escaping () -> Void) {
        self.init(title: title, sub: sub, checked: checked, off: off, enabled: enabled, onToggle: onToggle, trailing: { EmptyView() })
    }
}

/// A light press: dims a touch.
public struct LIPressStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// The one primary action: the gradient pill.
public struct LIPrimaryButton: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let busy: Bool
    let action: () -> Void

    public init(_ title: String, busy: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.busy = busy
        self.action = action
    }

    public var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            ZStack {
                Text(title).liType(.body).opacity(busy ? 0 : 1)
                if busy {
                    ProgressView().tint(theme.accentInk)
                }
            }
            .foregroundColor(theme.accentInk)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Capsule().fill(theme.gradient))
        }
        .buttonStyle(LIPressStyle())
        .disabled(busy)
    }
}

/// An everyday button: glass pill.
public struct LISecondaryButton: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let action: () -> Void

    public init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    public var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            Text(title)
                .liType(.body)
                .foregroundColor(theme.ink)
                .padding(.horizontal, 22)
                .frame(minHeight: 44)
                .background(Capsule().fill(theme.tile))
                .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
    }
}

/// One choice as a 44pt pill. Chosen is cream.
public struct LIChip: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let on: Bool
    let action: () -> Void

    public init(_ title: String, on: Bool, action: @escaping () -> Void) {
        self.title = title
        self.on = on
        self.action = action
    }

    public var body: some View {
        Button(action: {
            LIHaptics.tap()
            action()
        }) {
            Text(title)
                .liType(.sub)
                .foregroundColor(on ? theme.bg : theme.ink)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(Capsule().fill(on ? theme.ink : theme.tile))
                .overlay(Capsule().strokeBorder(on ? Color.clear : theme.tileLine, lineWidth: 1))
        }
        .buttonStyle(LIPressStyle())
    }
}

/// Two to seven even choices. The chosen one is a cream pill.
public struct LISegmentedControl<Value: Hashable>: View {
    @Environment(\.liTheme) private var theme
    let options: [(value: Value, title: String)]
    @Binding var selection: Value

    public init(options: [(value: Value, title: String)], selection: Binding<Value>) {
        self.options = options
        self._selection = selection
    }

    public var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<options.count, id: \.self) { i in
                let option = options[i]
                Button(action: {
                    LIHaptics.tap()
                    selection = option.value
                }) {
                    Text(option.title)
                        .liType(.sub)
                        .foregroundColor(selection == option.value ? theme.bg : theme.ink2)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(Capsule().fill(selection == option.value ? theme.ink : Color.clear))
                }
                .buttonStyle(LIPressStyle())
            }
        }
        .padding(4)
        .background(Capsule().fill(theme.tile))
        .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
    }
}

/// A thin ring with a gradient stroke. For a moment or a summary.
public struct LIProgressRing<Center: View>: View {
    @Environment(\.liTheme) private var theme
    let value: Double
    let size: CGFloat
    let stroke: CGFloat
    let center: Center

    public init(value: Double, size: CGFloat = 88, stroke: CGFloat = 5, @ViewBuilder center: () -> Center) {
        self.value = value
        self.size = size
        self.stroke = stroke
        self.center = center()
    }

    public var body: some View {
        ZStack {
            Circle().stroke(theme.hair, lineWidth: stroke)
            Circle()
                .trim(from: 0, to: CGFloat(max(0, min(1, value))))
                .stroke(theme.gradient, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.42), value: value)
            center
        }
        .frame(width: size, height: size)
    }
}

/// A hairline progress line.
public struct LIProgressBar: View {
    @Environment(\.liTheme) private var theme
    let value: Double
    let height: CGFloat

    public init(value: Double, height: CGFloat = 3) {
        self.value = value
        self.height = height
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(theme.hair)
                Capsule()
                    .fill(theme.gradient)
                    .frame(width: geo.size.width * CGFloat(max(0, min(1, value))))
                    .animation(.easeOut(duration: 0.3), value: value)
            }
        }
        .frame(height: height)
    }
}

/// A real empty state: one short title, one sentence, one action.
public struct LIEmptyState: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let message: String?
    let actionTitle: String?
    let action: (() -> Void)?

    public init(title: String, message: String? = nil, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: 10) {
            Text(title).liType(.h2).foregroundColor(theme.ink).multilineTextAlignment(.center)
            if let message = message {
                Text(message).liType(.sub).foregroundColor(theme.ink2).multilineTextAlignment(.center)
            }
            if let actionTitle = actionTitle, let action = action {
                LISecondaryButton(actionTitle, action: action).padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 20)
    }
}

/// A one line notice: offline, locked, an error.
public struct LINotice: View {
    @Environment(\.liTheme) private var theme
    let text: String
    let warn: Bool
    let actionTitle: String?
    let action: (() -> Void)?

    public init(_ text: String, warn: Bool = true, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.text = text
        self.warn = warn
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        HStack(spacing: 12) {
            Text(text).liType(.sub).foregroundColor(warn ? theme.warn : theme.ink2)
            Spacer(minLength: 0)
            if let actionTitle = actionTitle, let action = action {
                Button(action: action) {
                    Text(actionTitle).liType(.sub).foregroundColor(theme.ink).underline()
                }
                .buttonStyle(LIPressStyle())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(warn ? theme.warnSoft : theme.tile))
    }
}

// MARK: sheets

struct LISheetStyle: ViewModifier {
    @Environment(\.liTheme) private var theme

    func body(content: Content) -> some View {
        content
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(30)
            .presentationBackground(theme.surface)
            .environment(\.colorScheme, theme.colorScheme)
    }
}

extension View {
    /// The look of a bottom sheet: solid surface, 30pt top corners, drag indicator.
    public func liSheetStyle() -> some View {
        return modifier(LISheetStyle())
    }
}
