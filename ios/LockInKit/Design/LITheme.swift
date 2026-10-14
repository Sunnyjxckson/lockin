import SwiftUI

extension Color {
    /// "#rrggbb" or "rrggbb". Bad input reads as black.
    public init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        let r = Double((value >> 16) & 0xFF) / 255.0
        let g = Double((value >> 8) & 0xFF) / 255.0
        let b = Double(value & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

/// How strong the glass, tile and hairline fills are. Port of ThemeFx in src/lib/logic/theme.ts.
public struct LIFx: Equatable {
    public var glow: [Double]
    public var glassHi: Double
    public var glassLo: Double
    public var glassSmoke: Double
    public var glassLine: Double
    public var tile: Double
    public var tileLine: Double
    public var hair: Double
    public var bar: Double
}

/// The colors every screen draws with. Aubergine and High contrast bases from src/lib/logic/theme.ts,
/// optionally re-colored by the palette on the active `theme` row.
/// TODO: port the contrast fixing (ensure AA) that the web applies to custom palettes.
public struct LITheme: Equatable {
    public var base: ThemeBase
    public var isLight: Bool
    public var bg: Color
    public var surface: Color
    public var surface2: Color
    public var surface3: Color
    public var line: Color
    public var lineStrong: Color
    public var ink: Color
    public var ink2: Color
    public var ink3: Color
    public var accent: Color
    public var accent2: Color
    public var accentInk: Color
    public var accentInk2: Color
    public var danger: Color
    public var warn: Color
    public var glow1: Color
    public var glow2: Color
    public var glow3: Color
    public var fx: LIFx

    /// White on a dark page, black on a light one. Glass, tiles and hairlines are drawn with it.
    public var fill: Color { return isLight ? Color.black : Color.white }
    public var glassHi: Color { return fill.opacity(fx.glassHi) }
    public var glassLo: Color { return fill.opacity(fx.glassLo) }
    public var glassLine: Color { return fill.opacity(fx.glassLine) }
    public var tile: Color { return fill.opacity(fx.tile) }
    public var tileLine: Color { return fill.opacity(fx.tileLine) }
    public var hair: Color { return fill.opacity(fx.hair) }
    public var bar: Color { return surface.opacity(fx.bar) }
    public var accentSoft: Color { return accent.opacity(0.12) }
    public var warnSoft: Color { return warn.opacity(0.12) }
    public var dangerSoft: Color { return danger.opacity(0.12) }

    /// The gradient that means done or primary and nothing else.
    public var gradient: LinearGradient {
        return LinearGradient(colors: [accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    public var colorScheme: ColorScheme { return isLight ? .light : .dark }

    public static let dark = LITheme(
        base: .dark,
        isLight: false,
        bg: Color(hex: "#0d0b10"),
        surface: Color(hex: "#17141b"),
        surface2: Color(hex: "#1f1b24"),
        surface3: Color(hex: "#2a2530"),
        line: Color(hex: "#2b2731"),
        lineStrong: Color(hex: "#423c4a"),
        ink: Color(hex: "#f4efe8"),
        ink2: Color(hex: "#b9b1c0"),
        ink3: Color(hex: "#aaa2b1"),
        accent: Color(hex: "#e3c79a"),
        accent2: Color(hex: "#d98fb4"),
        accentInk: Color(hex: "#0d0b10"),
        accentInk2: Color(hex: "#3a2a2e"),
        danger: Color(hex: "#ff9b91"),
        warn: Color(hex: "#f5a65b"),
        glow1: Color(hex: "#a85c96"),
        glow2: Color(hex: "#d6965c"),
        glow3: Color(hex: "#5c50aa"),
        fx: LIFx(glow: [0.4, 0.24, 0.3], glassHi: 0.1, glassLo: 0.03, glassSmoke: 0.4, glassLine: 0.12, tile: 0.045, tileLine: 0.08, hair: 0.12, bar: 0.86)
    )

    public static let contrast = LITheme(
        base: .contrast,
        isLight: false,
        bg: Color(hex: "#000000"),
        surface: Color(hex: "#0b0b0b"),
        surface2: Color(hex: "#161616"),
        surface3: Color(hex: "#222222"),
        line: Color(hex: "#5a5a5a"),
        lineStrong: Color(hex: "#8c8c8c"),
        ink: Color(hex: "#ffffff"),
        ink2: Color(hex: "#e2e2e2"),
        ink3: Color(hex: "#c4c4c4"),
        accent: Color(hex: "#f3dcb4"),
        accent2: Color(hex: "#f4b3d0"),
        accentInk: Color(hex: "#000000"),
        accentInk2: Color(hex: "#2b1d22"),
        danger: Color(hex: "#ff9d94"),
        warn: Color(hex: "#ffc27a"),
        glow1: Color(hex: "#a85c96"),
        glow2: Color(hex: "#d6965c"),
        glow3: Color(hex: "#5c50aa"),
        fx: LIFx(glow: [0.1, 0.06, 0.08], glassHi: 0.05, glassLo: 0.02, glassSmoke: 0.5, glassLine: 0.4, tile: 0.03, tileLine: 0.34, hair: 0.3, bar: 1)
    )

    /// The base theme with the palette of the active theme row laid over it.
    public static func make(base: ThemeBase, palette: ThemePalette?) -> LITheme {
        var t = base == .contrast ? LITheme.contrast : LITheme.dark
        guard let p = palette else { return t }
        if let v = p.background { t.bg = Color(hex: v); t.isLight = LITheme.luminance(hex: v) > 0.5 }
        if let v = p.surface {
            t.surface = Color(hex: v)
            t.surface2 = Color(hex: v)
            t.surface3 = Color(hex: v)
        }
        if let v = p.text { t.ink = Color(hex: v) }
        if let v = p.muted {
            t.ink2 = Color(hex: v)
            t.ink3 = Color(hex: v)
        }
        if let v = p.accent { t.accent = Color(hex: v) }
        if t.isLight {
            t.fx = LIFx(glow: [0.3, 0.22, 0.22], glassHi: 0.72, glassLo: 0.42, glassSmoke: 0, glassLine: 0.1, tile: 0.5, tileLine: 0.08, hair: 0.12, bar: 0.86)
        }
        return t
    }

    /// Relative luminance of "#rrggbb", 0 to 1.
    public static func luminance(hex: String) -> Double {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        func lin(_ c: Double) -> Double {
            return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let r = lin(Double((value >> 16) & 0xFF) / 255.0)
        let g = lin(Double((value >> 8) & 0xFF) / 255.0)
        let b = lin(Double(value & 0xFF) / 255.0)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
}

private struct LIThemeKey: EnvironmentKey {
    static var defaultValue: LITheme { return LITheme.dark }
}

extension EnvironmentValues {
    public var liTheme: LITheme {
        get { return self[LIThemeKey.self] }
        set { self[LIThemeKey.self] = newValue }
    }
}
