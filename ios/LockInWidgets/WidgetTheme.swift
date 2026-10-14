import SwiftUI
import WidgetKit
import LockInKit

/// The Lock In tokens as the widgets draw them. They follow the look the app wrote into the snapshot (base and palette),
/// and are the dark Aubergine look until the app has written one.
enum W {
    private static var built: LITheme? = nil
    private static var builtBase: String? = nil
    private static var builtPalette: ThemePalette? = nil

    static var theme: LITheme {
        if let t = built { return t }
        apply(WidgetSnapshot.load())
        return built ?? LITheme.dark
    }

    /// Call whenever a snapshot is read, so the colors follow it.
    static func apply(_ snapshot: WidgetSnapshot?) {
        let base = snapshot?.themeBase
        let palette = snapshot?.themePalette
        if built != nil && base == builtBase && palette == builtPalette { return }
        builtBase = base
        builtPalette = palette
        built = LITheme.make(base: ThemeBase(rawValue: base ?? "") ?? .dark, palette: palette)
    }
    static var bg: Color { return theme.bg }
    static var ink: Color { return theme.ink }
    static var ink2: Color { return theme.ink2 }
    static var ink3: Color { return theme.ink3 }
    static var accent: Color { return theme.accent }
    static var accent2: Color { return theme.accent2 }
    static var accentInk: Color { return theme.accentInk }
    static var warn: Color { return theme.warn }
    static var hair: Color { return Color.white.opacity(0.12) }
    static var gradient: LinearGradient { return theme.gradient }

    static func medium(_ size: CGFloat) -> Font { return LIFont.medium(size) }
    static func regular(_ size: CGFloat) -> Font { return LIFont.regular(size) }
}

/// The page behind a home screen widget: the base color with two soft lights, like the app.
struct WidgetBackdrop: View {
    var body: some View {
        ZStack {
            W.bg
            RadialGradient(colors: [W.theme.glow1.opacity(0.34), Color.clear], center: .topTrailing, startRadius: 0, endRadius: 220)
            RadialGradient(colors: [W.theme.glow3.opacity(0.26), Color.clear], center: .bottomLeading, startRadius: 0, endRadius: 200)
        }
    }
}

/// The small uppercase tracked label.
struct WLabel: View {
    let text: String
    var color: Color = W.ink2

    init(_ text: String, color: Color = W.ink2) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text)
            .font(W.medium(10))
            .tracking(1.0)
            .textCase(.uppercase)
            .foregroundColor(color)
            .lineLimit(1)
    }
}

/// A thin gradient ring with the percent inside.
struct WRing: View {
    let percent: Int
    let size: CGFloat
    let stroke: CGFloat
    var numberSize: CGFloat = 26

    var body: some View {
        ZStack {
            Circle().stroke(W.hair, lineWidth: stroke)
            Circle()
                .trim(from: 0, to: CGFloat(max(0, min(100, percent))) / 100.0)
                .stroke(W.gradient, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
                .rotationEffect(.degrees(-90))
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text("\(percent)").font(W.medium(numberSize)).tracking(-numberSize * 0.03).foregroundColor(W.ink)
                Text("%").font(W.medium(numberSize * 0.4)).foregroundColor(W.ink2)
            }
        }
        .frame(width: size, height: size)
    }
}

struct WBar: View {
    let value: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(W.hair)
                Capsule().fill(W.gradient).frame(width: geo.size.width * CGFloat(max(0, min(1, value))))
            }
        }
        .frame(height: 3)
    }
}

/// The round tick, as on Today.
struct WTick: View {
    let done: Bool
    var size: CGFloat = 22

    var body: some View {
        ZStack {
            if done {
                Circle().fill(W.gradient)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundColor(W.accentInk)
            } else {
                Circle().strokeBorder(W.ink3.opacity(0.7), lineWidth: 1.5)
            }
        }
        .frame(width: size, height: size)
    }
}

func wMoney(_ n: Double) -> String {
    let r = (n * 100).rounded() / 100
    if r == r.rounded() { return "$\(Int(r))" }
    return String(format: "$%.2f", r)
}
