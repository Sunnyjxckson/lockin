import SwiftUI

extension LITheme {
    /// A theme from the contrast-fixed tokens of ThemeBuild (the port of buildTheme in src/lib/logic/theme.ts).
    public init(built b: BuiltTheme) {
        func c(_ name: String) -> Color { return Color(hex: b.tokens[name] ?? "#000000") }
        self.init(
            base: b.base,
            isLight: b.isLight,
            bg: c("bg"),
            surface: c("surface"),
            surface2: c("surface-2"),
            surface3: c("surface-3"),
            line: c("line"),
            lineStrong: c("line-strong"),
            ink: c("ink"),
            ink2: c("ink-2"),
            ink3: c("ink-3"),
            accent: c("accent"),
            accent2: c("accent-2"),
            accentInk: c("accent-ink"),
            accentInk2: c("accent-ink-2"),
            danger: c("danger"),
            warn: c("warn"),
            glow1: c("glow-1"),
            glow2: c("glow-2"),
            glow3: c("glow-3"),
            fx: LIFx(glow: b.fx.glow, glassHi: b.fx.glassHi, glassLo: b.fx.glassLo, glassSmoke: b.fx.glassSmoke, glassLine: b.fx.glassLine, tile: b.fx.tile, tileLine: b.fx.tileLine, hair: b.fx.hair, bar: b.fx.bar)
        )
    }
}
