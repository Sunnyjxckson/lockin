import Foundation

// Themes as data. Pure functions, no UI. Port of src/lib/logic/theme.ts.
//
// A theme is a base ("dark" is Aubergine, the default look, and "contrast" is high contrast) plus an
// optional palette on top (background, surface, text, muted, accent). Any palette goes in, a usable
// theme comes out. Every pair the app draws is held to WCAG AA: a color that fails is moved along its
// own lightness until it passes, and a light that would wash text out is turned down, so the hue you
// picked stays and the screen stays readable. The minimum is 4.5 to 1. High contrast holds 7 to 1.

public struct RGB: Equatable {
    public var r: Double
    public var g: Double
    public var b: Double
    public init(_ r: Double, _ g: Double, _ b: Double) {
        self.r = r
        self.g = g
        self.b = b
    }
}

public let themeTokenNames: [String] = [
    "bg", "surface", "surface-2", "surface-3", "line", "line-strong", "ink", "ink-2", "ink-3",
    "accent", "accent-2", "accent-ink", "accent-ink-2", "danger", "warn", "glow-1", "glow-2", "glow-3",
]

/// Strengths, each 0 to 1. Colors are in the tokens.
public struct ThemeFxValues: Equatable {
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

public struct BuiltTheme: Equatable {
    public var base: ThemeBase
    /// Whether the page is dark with light text or the other way round.
    public var isLight: Bool
    /// True when a palette sits on top of the base.
    public var custom: Bool
    public var tokens: [String: String]
    public var fx: ThemeFxValues
    /// Tokens that were moved to meet contrast, or pulled into range. Empty when the palette passed as given.
    public var adjusted: [String]
}

public struct ThemeGround: Equatable {
    public var name: String
    public var color: String
}

public struct ContrastCheck: Equatable {
    public var label: String
    public var fg: String
    public var bg: String
    public var ratio: Double
    public var min: Double
    public var pass: Bool
}

struct BaseThemeDef {
    var min: Double
    var inkMin: Double
    var tokens: [String: String]
    var fx: ThemeFxValues
    var fxLight: ThemeFxValues
}

public enum ThemeBuild {
    static let dark = BaseThemeDef(
        min: 4.5,
        inkMin: 7,
        tokens: [
            "bg": "#0d0b10", "surface": "#17141b", "surface-2": "#1f1b24", "surface-3": "#2a2530",
            "line": "#2b2731", "line-strong": "#423c4a", "ink": "#f4efe8", "ink-2": "#b9b1c0", "ink-3": "#aaa2b1",
            "accent": "#e3c79a", "accent-2": "#d98fb4", "accent-ink": "#0d0b10", "accent-ink-2": "#3a2a2e",
            "danger": "#ff9b91", "warn": "#f5a65b", "glow-1": "#a85c96", "glow-2": "#d6965c", "glow-3": "#5c50aa",
        ],
        fx: ThemeFxValues(glow: [0.4, 0.24, 0.3], glassHi: 0.1, glassLo: 0.03, glassSmoke: 0.4, glassLine: 0.12, tile: 0.045, tileLine: 0.08, hair: 0.12, bar: 0.86),
        fxLight: ThemeFxValues(glow: [0.3, 0.22, 0.22], glassHi: 0.72, glassLo: 0.42, glassSmoke: 0, glassLine: 0.1, tile: 0.5, tileLine: 0.08, hair: 0.12, bar: 0.86)
    )

    static let contrastBase = BaseThemeDef(
        min: 7,
        inkMin: 12,
        tokens: [
            "bg": "#000000", "surface": "#0b0b0b", "surface-2": "#161616", "surface-3": "#222222",
            "line": "#5a5a5a", "line-strong": "#8c8c8c", "ink": "#ffffff", "ink-2": "#e2e2e2", "ink-3": "#c4c4c4",
            "accent": "#f3dcb4", "accent-2": "#f4b3d0", "accent-ink": "#000000", "accent-ink-2": "#2b1d22",
            "danger": "#ff9d94", "warn": "#ffc27a", "glow-1": "#a85c96", "glow-2": "#d6965c", "glow-3": "#5c50aa",
        ],
        fx: ThemeFxValues(glow: [0.1, 0.06, 0.08], glassHi: 0.05, glassLo: 0.02, glassSmoke: 0.5, glassLine: 0.4, tile: 0.03, tileLine: 0.34, hair: 0.3, bar: 1),
        fxLight: ThemeFxValues(glow: [0.08, 0.06, 0.06], glassHi: 0.8, glassLo: 0.6, glassSmoke: 0, glassLine: 0.5, tile: 0.6, tileLine: 0.42, hair: 0.3, bar: 1)
    )

    static func def(_ base: ThemeBase) -> BaseThemeDef {
        return base == .contrast ? contrastBase : dark
    }

    public static func baseName(_ base: ThemeBase) -> String {
        return base == .contrast ? "High contrast" : "Aubergine"
    }

    public static func baseBlurb(_ base: ThemeBase) -> String {
        return base == .contrast ? "Pure black, white text, strong lines." : "Near black plum, soft light, champagne to rose."
    }

    // MARK: color math

    static func hexValue(_ s: String) -> Int? {
        return Int(s, radix: 16)
    }

    static func isHexDigits(_ s: String) -> Bool {
        if s.isEmpty { return false }
        for u in s.unicodeScalars {
            let v = u.value
            let ok = (v >= 48 && v <= 57) || (v >= 65 && v <= 70) || (v >= 97 && v <= 102)
            if !ok { return false }
        }
        return true
    }

    /// "#rgb" or "#rrggbb" (the hash is optional) to 0..255 channels. Nil when it is not a hex color.
    public static func parseHex(_ input: String?) -> RGB? {
        guard let input = input else { return nil }
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        if !isHexDigits(s) { return nil }
        let chars = Array(s)
        if chars.count == 3 {
            guard let r = hexValue(String([chars[0], chars[0]])), let g = hexValue(String([chars[1], chars[1]])), let b = hexValue(String([chars[2], chars[2]])) else { return nil }
            return RGB(Double(r), Double(g), Double(b))
        }
        if chars.count == 6 {
            guard let r = hexValue(String(chars[0...1])), let g = hexValue(String(chars[2...3])), let b = hexValue(String(chars[4...5])) else { return nil }
            return RGB(Double(r), Double(g), Double(b))
        }
        return nil
    }

    static func clamp255(_ n: Double) -> Int {
        return Int(Swift.min(255, Swift.max(0, MealsCore.jsRound(n))))
    }

    static func hex2(_ n: Int) -> String {
        let s = String(n, radix: 16)
        return s.count < 2 ? "0" + s : s
    }

    public static func toHex(_ c: RGB) -> String {
        return "#" + hex2(clamp255(c.r)) + hex2(clamp255(c.g)) + hex2(clamp255(c.b))
    }

    /// A clean "#rrggbb", or nil.
    public static func normalizeHex(_ input: String?) -> String? {
        guard let rgb = parseHex(input) else { return nil }
        return toHex(rgb)
    }

    static func rgbOf(_ color: String) -> RGB {
        return parseHex(color) ?? RGB(0, 0, 0)
    }

    static func lin(_ c: Double) -> Double {
        let v = c / 255
        return v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
    }

    /// WCAG relative luminance, 0 (black) to 1 (white).
    public static func luminance(_ color: String) -> Double {
        let c = rgbOf(color)
        return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    }

    /// WCAG contrast ratio, 1 to 21.
    public static func contrast(_ a: String, _ b: String) -> Double {
        let la = luminance(a)
        let lb = luminance(b)
        return (Swift.max(la, lb) + 0.05) / (Swift.min(la, lb) + 0.05)
    }

    /// `t` of the way from a to b.
    public static func mix(_ a: String, _ b: String, _ t: Double) -> String {
        let x = rgbOf(a)
        let y = rgbOf(b)
        return toHex(RGB(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t))
    }

    /// A see-through color laid over a solid one, as the solid color it looks like.
    public static func over(_ color: String, _ alpha: Double, _ background: String) -> String {
        return mix(background, color, alpha)
    }

    static func toHsl(_ c: RGB) -> (h: Double, s: Double, l: Double) {
        let r = c.r / 255
        let g = c.g / 255
        let b = c.b / 255
        let mx = Swift.max(r, g, b)
        let mn = Swift.min(r, g, b)
        let l = (mx + mn) / 2
        let d = mx - mn
        if d == 0 { return (0, 0, l) }
        let s = d / (1 - abs(2 * l - 1))
        var h: Double
        if mx == r {
            h = ((g - b) / d).truncatingRemainder(dividingBy: 6)
        } else if mx == g {
            h = (b - r) / d + 2
        } else {
            h = (r - g) / d + 4
        }
        h *= 60
        if h < 0 { h += 360 }
        return (h, s, l)
    }

    static func fromHsl(_ h: Double, _ s: Double, _ l: Double) -> RGB {
        let c = (1 - abs(2 * l - 1)) * s
        let x = c * (1 - abs((h / 60).truncatingRemainder(dividingBy: 2) - 1))
        let m = l - c / 2
        var r = 0.0, g = 0.0, b = 0.0
        if h < 60 { r = c; g = x; b = 0 }
        else if h < 120 { r = x; g = c; b = 0 }
        else if h < 180 { r = 0; g = c; b = x }
        else if h < 240 { r = 0; g = x; b = c }
        else if h < 300 { r = x; g = 0; b = c }
        else { r = c; g = 0; b = x }
        return RGB((r + m) * 255, (g + m) * 255, (b + m) * 255)
    }

    /// The same hue and saturation at another lightness, 0 to 1.
    public static func withLightness(_ color: String, _ l: Double) -> String {
        let hsl = toHsl(rgbOf(color))
        return toHex(fromHsl(hsl.h, hsl.s, Swift.min(1, Swift.max(0, l))))
    }

    static func lightnessOf(_ color: String) -> Double {
        return toHsl(rgbOf(color)).l
    }

    /// Move a color along its own lightness, as little as possible, until `ok` holds. `dir` is 1 for
    /// lighter and -1 for darker. Nil when even the end of the scale (white or black) fails.
    static func slide(_ color: String, _ dir: Int, _ ok: (String) -> Bool) -> String? {
        if ok(color) { return color }
        let end: Double = dir == 1 ? 1 : 0
        if !ok(withLightness(color, end)) { return nil }
        var lo = lightnessOf(color)
        var hi = end
        for _ in 0..<24 {
            let mid = (lo + hi) / 2
            if ok(withLightness(color, mid)) { hi = mid } else { lo = mid }
        }
        return withLightness(color, hi)
    }

    /// The closest color to `fg`, same hue, that has at least `min` contrast on every background. Tries the
    /// direction away from the backgrounds first. When nothing reaches `min`, returns black or white.
    public static func ensureContrast(_ fg: String, _ backgrounds: [String], _ min: Double) -> String {
        let lums = backgrounds.map { luminance($0) }
        func worst(_ c: String) -> Double {
            let l = luminance(c)
            var w = Double.infinity
            for x in lums { w = Swift.min(w, (Swift.max(l, x) + 0.05) / (Swift.min(l, x) + 0.05)) }
            return w
        }
        func ok(_ c: String) -> Bool { return worst(c) >= min }
        let clean = normalizeHex(fg) ?? "#808080"
        if backgrounds.isEmpty || ok(clean) { return clean }
        let avg = lums.reduce(0, +) / Double(Swift.max(1, lums.count))
        let dark = avg < 0.18
        let first = dark ? 1 : -1
        if let found = slide(clean, first, ok) ?? slide(clean, first == 1 ? -1 : 1, ok) { return found }
        return worst("#ffffff") >= worst("#000000") ? "#ffffff" : "#000000"
    }

    /// The same color with its hue turned by `deg`, at a given saturation and lightness (each 0 to 1) when passed.
    public static func shiftHue(_ color: String, _ deg: Double, _ s: Double? = nil, _ l: Double? = nil) -> String {
        let hsl = toHsl(rgbOf(color))
        let nh = ((hsl.h + deg).truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        return toHex(fromHsl(nh, Swift.min(1, Swift.max(0, s ?? hsl.s)), Swift.min(1, Swift.max(0, l ?? hsl.l))))
    }

    /// The same hue and saturation at the lightness that gives this luminance.
    static func atLuminance(_ color: String, _ target: Double) -> String {
        var lo = 0.0
        var hi = 1.0
        for _ in 0..<24 {
            let mid = (lo + hi) / 2
            if luminance(withLightness(color, mid)) < target { lo = mid } else { hi = mid }
        }
        return withLightness(color, hi)
    }

    /// Black or white tinted with the color, whichever reads better on every fill.
    static func inkOn(_ fills: [String], _ min: Double) -> String {
        let dark = mix(fills[0], "#000000", 0.92)
        let light = mix(fills[0], "#ffffff", 0.94)
        func worst(_ c: String) -> Double { return fills.map { contrast(c, $0) }.min() ?? 0 }
        return ensureContrast(worst(dark) >= worst(light) ? dark : light, fills, min)
    }

    // MARK: the grounds text sits on

    static let white = "#ffffff"
    static let black = "#000000"

    /// The page: plain, and at the brightest point of each light source.
    static func pageGrounds(_ tokens: [String: String], _ fx: ThemeFxValues) -> [ThemeGround] {
        var out = [ThemeGround(name: "bg", color: tokens["bg"] ?? "#000000")]
        for n in 1...3 {
            let a = fx.glow[n - 1]
            if a > 0 { out.append(ThemeGround(name: "bg under glow-\(n)", color: over(tokens["glow-\(n)"] ?? "#000000", a, tokens["bg"] ?? "#000000"))) }
        }
        return out
    }

    /// Glass over each page ground, at both ends of its own gradient.
    static func glassGrounds(_ tokens: [String: String], _ fx: ThemeFxValues) -> [ThemeGround] {
        var out: [ThemeGround] = []
        for g in pageGrounds(tokens, fx) {
            let smoked = over(tokens["bg"] ?? "#000000", fx.glassSmoke, g.color)
            out.append(ThemeGround(name: "glass over \(g.name)", color: over(white, fx.glassHi, smoked)))
            out.append(ThemeGround(name: "glass (far corner) over \(g.name)", color: over(white, fx.glassLo, smoked)))
        }
        return out
    }

    /// The floating tab bar with the worst things that can scroll under it: the page, a light, a done tile, a primary button.
    static func barGrounds(_ tokens: [String: String], _ fx: ThemeFxValues) -> [ThemeGround] {
        var under = pageGrounds(tokens, fx)
        under.append(ThemeGround(name: "accent", color: tokens["accent"] ?? "#000000"))
        under.append(ThemeGround(name: "accent-2", color: tokens["accent-2"] ?? "#000000"))
        under.append(ThemeGround(name: "ink", color: tokens["ink"] ?? "#000000"))
        return under.map { ThemeGround(name: "bar over \($0.name)", color: over(tokens["surface"] ?? "#000000", fx.bar, $0.color)) }
    }

    /// The accent gradient where text can sit on it: both ends and the middle.
    static func accentGrounds(_ tokens: [String: String]) -> [ThemeGround] {
        let a = tokens["accent"] ?? "#000000"
        let b = tokens["accent-2"] ?? "#000000"
        return [
            ThemeGround(name: "accent", color: a),
            ThemeGround(name: "accent to accent-2, middle", color: mix(a, b, 0.5)),
            ThemeGround(name: "accent-2", color: b),
        ]
    }

    static func solidGrounds(_ tokens: [String: String], _ names: [String]) -> [ThemeGround] {
        return names.map { ThemeGround(name: $0, color: tokens[$0] ?? "#000000") }
    }

    static func textGrounds(_ tokens: [String: String], _ fx: ThemeFxValues) -> [ThemeGround] {
        return pageGrounds(tokens, fx) + solidGrounds(tokens, ["surface", "surface-2", "surface-3"]) + glassGrounds(tokens, fx)
    }

    static func signalGrounds(_ tokens: [String: String], _ fx: ThemeFxValues) -> [ThemeGround] {
        return pageGrounds(tokens, fx) + solidGrounds(tokens, ["surface", "surface-2"]) + glassGrounds(tokens, fx)
    }

    static func softGrounds(_ tokens: [String: String], _ fx: ThemeFxValues) -> [ThemeGround] {
        return pageGrounds(tokens, fx) + solidGrounds(tokens, ["surface", "surface-2"])
    }

    // MARK: building a theme

    static let soft = 0.12

    static func atMostLuminance(_ color: String, _ mx: Double) -> String {
        return slide(color, -1) { luminance($0) <= mx } ?? "#000000"
    }

    static func atLeastLuminance(_ color: String, _ mn: Double) -> String {
        return slide(color, 1) { luminance($0) >= mn } ?? "#ffffff"
    }

    static func hasPalette(_ p: ThemePalette?) -> Bool {
        guard let p = p else { return false }
        return [p.background, p.surface, p.text, p.muted, p.accent].contains { normalizeHex($0) != nil }
    }

    /// Only the valid colors of a palette, each as "#rrggbb". Nil when nothing is left.
    public static func cleanPalette(_ p: ThemePalette?) -> ThemePalette? {
        guard let p = p else { return nil }
        var out = ThemePalette()
        out.background = normalizeHex(p.background)
        out.surface = normalizeHex(p.surface)
        out.text = normalizeHex(p.text)
        out.muted = normalizeHex(p.muted)
        out.accent = normalizeHex(p.accent)
        if out.background == nil && out.surface == nil && out.text == nil && out.muted == nil && out.accent == nil { return nil }
        return out
    }

    /// The three light sources for an accent: a plum, a warm amber and an indigo. A gray accent has no hue
    /// to turn, so it gets quiet gray light.
    public static func glowsFor(_ accent: String) -> [String] {
        let s = toHsl(rgbOf(accent)).s
        let k = Swift.min(1, s / 0.3)
        return [shiftHue(accent, -80, 0.33 * k, 0.51), shiftHue(accent, -9, 0.6 * k, 0.6), shiftHue(accent, -149, 0.36 * k, 0.49)]
    }

    /// The far end of the accent gradient: a neighboring hue, at the same luminance so one text color reads across it.
    public static func accentPairFor(_ accent: String) -> String {
        let s = toHsl(rgbOf(accent)).s
        return atLuminance(shiftHue(accent, -40, Swift.min(1, s * 0.9)), luminance(accent))
    }

    static func round3(_ x: Double) -> Double {
        return MealsCore.jsRound(x * 1000) / 1000
    }

    /// A complete theme from a base and an optional palette. With no palette the base comes back exactly as
    /// it ships. Never fails: colors that are not hex are ignored, and anything unreadable is adjusted.
    public static func build(_ base: ThemeBase = .dark, _ palette: ThemePalette? = nil) -> BuiltTheme {
        let b = def(base)
        guard hasPalette(palette), let p = cleanPalette(palette) else {
            return BuiltTheme(base: base, isLight: false, custom: false, tokens: b.tokens, fx: b.fx, adjusted: [])
        }
        var adjusted = Set<String>()
        func note(_ token: String, _ asked: String?, _ got: String) -> String {
            if let a = asked, a != got { adjusted.insert(token) }
            return got
        }
        let rangeBg: Double = base == .contrast ? 0.008 : 0.035
        let rangeSurface: Double = base == .contrast ? 0.012 : 0.05

        let askedBg = p.background ?? b.tokens["bg"]!
        let isLight = luminance(askedBg) >= 0.18
        let pole = isLight ? black : white
        let lightMin: Double = base == .contrast ? 0.85 : 0.6
        let bg = note("bg", p.background, isLight ? atLeastLuminance(askedBg, lightMin) : atMostLuminance(askedBg, rangeBg))

        let stepped = mix(bg, pole, isLight ? 0.035 : 0.045)
        var surface = stepped
        if let ps = p.surface {
            let inRange = isLight ? atLeastLuminance(ps, lightMin - 0.08) : atMostLuminance(ps, rangeSurface)
            surface = note("surface", ps, inRange)
        }
        let surface2 = mix(surface, pole, isLight ? 0.035 : 0.04)
        let surface3 = mix(surface, pole, isLight ? 0.08 : 0.09)

        let strong = base == .contrast
        let line = strong ? ensureContrast(mix(bg, pole, 0.32), [bg, surface], 2.4) : mix(surface, pole, 0.075)
        let lineStrong = strong ? ensureContrast(mix(bg, pole, 0.5), [bg, surface], 4.5) : mix(surface, pole, 0.17)

        let askedAccent = p.accent ?? b.tokens["accent"]!
        let glows: [String] = p.accent != nil ? glowsFor(askedAccent) : [b.tokens["glow-1"]!, b.tokens["glow-2"]!, b.tokens["glow-3"]!]
        var draft = b.tokens
        draft["bg"] = bg
        draft["surface"] = surface
        draft["surface-2"] = surface2
        draft["surface-3"] = surface3
        draft["line"] = line
        draft["line-strong"] = lineStrong
        draft["glow-1"] = glows[0]
        draft["glow-2"] = glows[1]
        draft["glow-3"] = glows[2]

        var fx = isLight ? b.fxLight : b.fx
        let edge = luminance(surface3)
        let limit: Double = isLight ? edge : Swift.max(Swift.min(1.05 / b.inkMin, 0.5 / b.min) - 0.05, edge)
        func within() -> Bool {
            let all = pageGrounds(draft, fx) + glassGrounds(draft, fx)
            return all.allSatisfy { g in
                isLight ? luminance(g.color) >= limit - 1e-9 : luminance(g.color) <= limit + 1e-9
            }
        }
        var i = 0
        while i < 14 && !within() {
            fx.glow = fx.glow.map { round3($0 * 0.78) }
            i += 1
        }
        if !within() { fx.glow = [0, 0, 0] }
        i = 0
        while i < 14 && !within() {
            if !isLight {
                fx.glassHi = round3(fx.glassHi * 0.75)
            } else {
                fx.glassLo = round3(fx.glassLo + (1 - fx.glassLo) * 0.3)
            }
            fx.glassLo = !isLight ? Swift.min(fx.glassLo, fx.glassHi) : fx.glassLo
            fx.glassHi = isLight ? Swift.max(fx.glassHi, fx.glassLo) : fx.glassHi
            i += 1
        }
        if !within() {
            fx.glassHi = isLight ? 1 : 0
            fx.glassLo = fx.glassHi
        }

        let grounds = textGrounds(draft, fx).map { $0.color }
        let askedInk = p.text ?? (isLight ? mix(bg, black, 0.93) : b.tokens["ink"]!)
        let ink = note("ink", p.text, ensureContrast(askedInk, grounds, b.inkMin))
        let ink2: String
        if let muted = p.muted {
            ink2 = note("ink-2", muted, ensureContrast(muted, grounds, b.min))
        } else {
            ink2 = ensureContrast(mix(ink, bg, 0.26), grounds, b.min + 1)
        }
        let ink3 = ensureContrast(mix(ink2, bg, 0.12), grounds, b.min)

        let signal = signalGrounds(draft, fx).map { $0.color }
        let softOn = softGrounds(draft, fx).map { $0.color }
        func readable(_ asked: String) -> String {
            var c = ensureContrast(asked, signal, b.min)
            for _ in 0..<4 {
                let softs = softOn.map { over(c, soft, $0) }
                let next = ensureContrast(c, signal + softs, b.min)
                if next == c { break }
                c = next
            }
            return c
        }
        let accent = note("accent", p.accent, readable(askedAccent))
        let accent2 = p.accent != nil ? accentPairFor(accent) : atLuminance(b.tokens["accent-2"]!, luminance(accent))
        let fills = [accent, mix(accent, accent2, 0.5), accent2]
        let accentInk = inkOn(fills, b.min)
        let accentInk2 = ensureContrast(mix(accentInk, accent, 0.22), fills, b.min)

        var tokens = draft
        tokens["ink"] = ink
        tokens["ink-2"] = ink2
        tokens["ink-3"] = ink3
        tokens["accent"] = accent
        tokens["accent-2"] = accent2
        tokens["accent-ink"] = accentInk
        tokens["accent-ink-2"] = accentInk2
        tokens["danger"] = readable(isLight ? "#c62a20" : b.tokens["danger"]!)
        tokens["warn"] = readable(isLight ? "#8a4a00" : b.tokens["warn"]!)

        func barOk() -> Bool {
            return barGrounds(tokens, fx).allSatisfy { contrast(ink2, $0.color) >= b.min && contrast(ink, $0.color) >= b.inkMin }
        }
        while fx.bar < 1 && !barOk() {
            fx.bar = Swift.min(1, MealsCore.jsRound((fx.bar + 0.04) * 100) / 100)
        }

        return BuiltTheme(base: base, isLight: isLight, custom: true, tokens: tokens, fx: fx, adjusted: themeTokenNames.filter { adjusted.contains($0) })
    }

    // MARK: checking a theme

    /// Every text and background pair the app draws, with its contrast.
    public static func audit(_ theme: BuiltTheme) -> [ContrastCheck] {
        let t = theme.tokens
        let b = def(theme.base)
        var out: [ContrastCheck] = []
        func add(_ label: String, _ fg: String, _ bg: String, _ mn: Double) {
            let ratio = MealsCore.jsRound(contrast(fg, bg) * 100) / 100
            out.append(ContrastCheck(label: label, fg: fg, bg: bg, ratio: ratio, min: mn, pass: ratio >= mn))
        }
        for g in textGrounds(t, theme.fx) {
            add("ink on \(g.name)", t["ink"]!, g.color, b.inkMin)
            add("ink-2 on \(g.name)", t["ink-2"]!, g.color, b.min)
            add("ink-3 on \(g.name)", t["ink-3"]!, g.color, b.min)
        }
        for c in ["accent", "danger", "warn"] {
            for g in signalGrounds(t, theme.fx) { add("\(c) on \(g.name)", t[c]!, g.color, b.min) }
            for g in softGrounds(t, theme.fx) { add("\(c) on \(c)-soft over \(g.name)", t[c]!, over(t[c]!, soft, g.color), b.min) }
        }
        for g in accentGrounds(t) {
            add("accent-ink on \(g.name)", t["accent-ink"]!, g.color, b.min)
            add("accent-ink-2 on \(g.name)", t["accent-ink-2"]!, g.color, b.min)
        }
        for g in barGrounds(t, theme.fx) {
            add("ink on \(g.name)", t["ink"]!, g.color, b.inkMin)
            add("ink-2 on \(g.name)", t["ink-2"]!, g.color, b.min)
        }
        add("bg on ink", t["bg"]!, t["ink"]!, b.inkMin)
        return out
    }

    public static func passes(_ theme: BuiltTheme) -> Bool {
        return audit(theme).allSatisfy { $0.pass }
    }
}
