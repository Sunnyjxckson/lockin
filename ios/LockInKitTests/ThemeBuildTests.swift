import XCTest
@testable import LockInKit

final class ThemeBuildTests: XCTestCase {
    typealias T = ThemeBuild

    func failures(_ base: ThemeBase, _ palette: ThemePalette?) -> [String] {
        return T.audit(T.build(base, palette)).filter { !$0.pass }.map { "\($0.label) \($0.ratio) < \($0.min)" }
    }

    /// A small fixed generator, so the same palettes are tried on every run.
    final class Gen {
        var s: UInt64
        init(_ seed: UInt64) { s = seed }
        func next() -> Double {
            s = (s * 1664525 + 1013904223) % 4294967296
            return Double(s) / 4294967296.0
        }
        func color() -> String {
            let r = next() * 255
            let g = next() * 255
            let b = next() * 255
            return ThemeBuild.toHex(RGB(r, g, b))
        }
        func maybe() -> String? {
            return next() < 0.7 ? color() : nil
        }
    }

    func rgb(_ hex: String) -> RGB { return T.parseHex(hex)! }

    // MARK: color math

    func testReadsHexColors() {
        XCTAssertEqual(T.parseHex("#fff"), RGB(255, 255, 255))
        XCTAssertEqual(T.parseHex("09090a"), RGB(9, 9, 10))
        XCTAssertEqual(T.parseHex("#C8F73A"), RGB(200, 247, 58))
        XCTAssertNil(T.parseHex("red"))
        XCTAssertNil(T.parseHex("#12345"))
        XCTAssertNil(T.parseHex(nil))
        XCTAssertEqual(T.normalizeHex(" #ABC "), "#aabbcc")
        XCTAssertEqual(T.toHex(RGB(300, -4, 127.6)), "#ff0080")
    }

    func testMatchesTheWcagNumbers() {
        XCTAssertEqual(T.luminance("#000000"), 0)
        XCTAssertEqual(T.luminance("#ffffff"), 1, accuracy: 1e-5)
        XCTAssertEqual(T.contrast("#000000", "#ffffff"), 21, accuracy: 1e-5)
        XCTAssertEqual(T.contrast("#ffffff", "#000000"), 21, accuracy: 1e-5)
        XCTAssertGreaterThanOrEqual(T.contrast("#767676", "#ffffff"), 4.5)
        XCTAssertLessThan(T.contrast("#777777", "#ffffff"), 4.5)
    }

    func testMixesAndLays() {
        XCTAssertEqual(T.mix("#000000", "#ffffff", 0.5), "#808080")
        XCTAssertEqual(T.mix("#102030", "#102030", 0.3), "#102030")
        XCTAssertEqual(T.over("#ffffff", 0.5, "#000000"), "#808080")
    }

    func testChangesLightnessWithoutChangingHue() {
        let c = rgb(T.withLightness("#8a1f1f", 0.8))
        XCTAssertGreaterThan(c.r, c.g)
        XCTAssertEqual(c.g, c.b)
        XCTAssertEqual(T.withLightness("#3366cc", 1), "#ffffff")
        XCTAssertEqual(T.withLightness("#3366cc", 0), "#000000")
    }

    // MARK: ensureContrast

    func testLeavesAPassingColorAlone() {
        XCTAssertEqual(T.ensureContrast("#f5f5f2", ["#09090a"], 4.5), "#f5f5f2")
    }

    func testLightensOnDarkNoFurtherThanNeeded() {
        let out = T.ensureContrast("#333344", ["#09090a", "#1b1b1d"], 4.5)
        XCTAssertGreaterThanOrEqual(T.contrast(out, "#1b1b1d"), 4.5)
        XCTAssertLessThan(T.contrast(out, "#1b1b1d"), 4.8)
        let c = rgb(out)
        XCTAssertGreaterThan(c.b, c.r)
        XCTAssertEqual(c.r, c.g)
    }

    func testDarkensOnLight() {
        let out = T.ensureContrast("#ffe45c", ["#ffffff", "#f4f4f4"], 4.5)
        XCTAssertGreaterThanOrEqual(T.contrast(out, "#f4f4f4"), 4.5)
        XCTAssertLessThan(T.luminance(out), T.luminance("#ffe45c"))
    }

    func testFallsBackToBlackOrWhite() {
        XCTAssertEqual(T.ensureContrast("#808080", ["#808080"], 7), "#000000")
        XCTAssertGreaterThanOrEqual(T.contrast(T.ensureContrast("nope", ["#000000"], 4.5), "#000000"), 4.5)
    }

    // MARK: base themes

    func testBasesPassEveryCheckAsShipped() {
        for base in ThemeBase.allCases {
            XCTAssertEqual(failures(base, nil), [])
            XCTAssertTrue(T.passes(T.build(base)))
        }
    }

    func testComesBackAsShippedWithoutAPalette() {
        let empties: [ThemePalette?] = [nil, ThemePalette(), ThemePalette(accent: "not a color")]
        for base in ThemeBase.allCases {
            for e in empties {
                let t = T.build(base, e)
                XCTAssertEqual(t.tokens, T.def(base).tokens)
                XCTAssertEqual(t.fx, T.def(base).fx)
                XCTAssertFalse(t.custom)
                XCTAssertEqual(t.adjusted, [])
                XCTAssertFalse(t.isLight)
            }
        }
    }

    func testHighContrastHoldsSevenToOne() {
        let worst = T.audit(T.build(.contrast)).map { $0.ratio }.min() ?? 0
        XCTAssertGreaterThanOrEqual(worst, 7)
    }

    func testAubergineIsTheDefaultLook() {
        let t = T.dark
        XCTAssertEqual(T.baseName(.dark), "Aubergine")
        XCTAssertEqual(t.tokens["bg"], "#0d0b10")
        XCTAssertEqual(t.tokens["ink"], "#f4efe8")
        XCTAssertEqual(t.tokens["accent"], "#e3c79a")
        XCTAssertEqual(t.tokens["accent-2"], "#d98fb4")
        XCTAssertTrue(t.fx.glow.allSatisfy { $0 > 0.2 })
        XCTAssertGreaterThan(t.fx.glassHi, t.fx.glassLo)
        XCTAssertLessThan(t.fx.bar, 1)
        XCTAssertLessThanOrEqual(T.contrastBase.fx.glow.max() ?? 1, 0.1)
        XCTAssertEqual(T.contrastBase.fx.bar, 1)
    }

    // MARK: grounds

    func testCountsPageAtEachLightAndGlass() {
        let t = T.build(.dark)
        let page = T.pageGrounds(t.tokens, t.fx)
        XCTAssertEqual(page.map { $0.name }, ["bg", "bg under glow-1", "bg under glow-2", "bg under glow-3"])
        XCTAssertEqual(page[1].color, T.over(t.tokens["glow-1"]!, t.fx.glow[0], t.tokens["bg"]!))
        for g in page.dropFirst() { XCTAssertGreaterThan(T.luminance(g.color), T.luminance(t.tokens["bg"]!), g.name) }
        let glass = T.glassGrounds(t.tokens, t.fx)
        XCTAssertEqual(glass.count, page.count * 2)
        XCTAssertGreaterThan(T.luminance(glass[0].color), T.luminance(t.tokens["bg"]!))
        XCTAssertEqual(glass[2].color, T.over("#ffffff", t.fx.glassHi, T.over(t.tokens["bg"]!, t.fx.glassSmoke, page[1].color)))
    }

    func testLeavesALightOutOnceOff() {
        let t = T.build(.dark)
        var fx = t.fx
        fx.glow = [0, 0.2, 0]
        XCTAssertEqual(T.pageGrounds(t.tokens, fx).map { $0.name }, ["bg", "bg under glow-2"])
    }

    func testMeasuresTheBarUnderDoneTilesAndButtons() {
        let t = T.build(.dark)
        let names = T.barGrounds(t.tokens, t.fx).map { $0.name }
        for n in ["bar over bg", "bar over bg under glow-1", "bar over accent", "bar over accent-2", "bar over ink"] { XCTAssertTrue(names.contains(n), n) }
        var fx = t.fx
        fx.bar = 1
        XCTAssertEqual(Set(T.barGrounds(t.tokens, fx).map { $0.color }), Set([t.tokens["surface"]!]))
    }

    func testAuditCoversTheGradientAndBar() {
        let labels = T.audit(T.build(.dark)).map { $0.label }
        for l in ["ink on bg under glow-1", "ink-3 on glass over bg under glow-1", "ink-2 on glass (far corner) over bg", "accent on glass over bg under glow-2", "warn on bg under glow-3", "accent-ink on accent to accent-2, middle", "accent-ink-2 on accent-2", "ink-2 on bar over ink", "ink on bar over accent", "bg on ink"] {
            XCTAssertTrue(labels.contains(l), l)
        }
        XCTAssertEqual(T.accentGrounds(T.build(.dark).tokens).map { $0.color }, ["#e3c79a", T.mix("#e3c79a", "#d98fb4", 0.5), "#d98fb4"])
    }

    func testAuditIsNotDecoration() {
        var t = T.build(.dark)
        var loud = t
        loud.fx.glow = [0.95, 0.95, 0.95]
        let failed = T.audit(loud).filter { !$0.pass }.map { $0.label }
        XCTAssertTrue(failed.contains("ink-3 on bg under glow-1"))
        XCTAssertTrue(failed.contains("ink-2 on glass over bg under glow-2"))
        var thin = t
        thin.fx.bar = 0.3
        XCTAssertTrue(T.audit(thin).filter { !$0.pass }.map { $0.label }.contains("ink-2 on bar over ink"))
        t.tokens["accent-2"] = "#3a1030"
        XCTAssertTrue(T.audit(t).filter { !$0.pass }.map { $0.label }.contains("accent-ink on accent-2"))
    }

    // MARK: the look under a palette

    func testTurnsTheLightsWithTheAccent() {
        let glows = T.glowsFor("#e3c79a")
        let g0 = rgb(glows[0])
        XCTAssertGreaterThan(g0.r, g0.g)
        XCTAssertGreaterThan(g0.b, g0.g)
        let g2 = rgb(glows[2])
        XCTAssertGreaterThan(g2.b, g2.r)
        let blue = T.build(.dark, ThemePalette(accent: "#5aa0ff"))
        XCTAssertEqual(blue.tokens["glow-1"], T.glowsFor("#5aa0ff")[0])
        XCTAssertNotEqual(blue.tokens["glow-1"], T.dark.tokens["glow-1"])
        for g in T.glowsFor("#888888") {
            let c = rgb(g)
            XCTAssertLessThanOrEqual(max(c.r, c.g, c.b) - min(c.r, c.g, c.b), 1)
        }
    }

    func testKeepsShippedLightsWithoutAnAccent() {
        let t = T.build(.dark, ThemePalette(background: "#0b1410"))
        XCTAssertEqual(t.tokens["glow-1"], T.dark.tokens["glow-1"])
        XCTAssertEqual(t.tokens["accent"], T.dark.tokens["accent"])
    }

    func testPairsTheAccentAtTheSameLuminance() {
        for accent in ["#5aa0ff", "#fca311", "#7ad6a8", "#ff4fa3", "#c8f73a"] {
            let t = T.build(.dark, ThemePalette(accent: accent)).tokens
            XCTAssertNotEqual(t["accent-2"], t["accent"], accent)
            XCTAssertLessThan(abs(T.luminance(t["accent-2"]!) - T.luminance(t["accent"]!)), 0.02, accent)
            XCTAssertEqual(t["accent-2"], T.accentPairFor(t["accent"]!))
            for g in T.accentGrounds(t) {
                XCTAssertGreaterThanOrEqual(T.contrast(t["accent-ink"]!, g.color), 4.5, "\(accent) \(g.name)")
                XCTAssertGreaterThanOrEqual(T.contrast(t["accent-ink-2"]!, g.color), 4.5, "\(accent) \(g.name)")
            }
        }
        XCTAssertEqual(T.shiftHue("#ff0000", 120), "#00ff00")
    }

    func testTurnsLightsDownNotTextUp() {
        let roomy = T.build(.dark, ThemePalette(background: "#0b0d12", accent: "#7cc4ff"))
        let tight = T.build(.dark, ThemePalette(background: "#1c2a3d", accent: "#7cc4ff"))
        XCTAssertEqual(roomy.fx.glow, T.dark.fx.glow)
        XCTAssertLessThan(tight.fx.glow[0], roomy.fx.glow[0])
        XCTAssertTrue(T.passes(tight))
        XCTAssertGreaterThan(tight.fx.glassHi, 0)
        XCTAssertGreaterThan(T.contrast(tight.tokens["ink-2"]!, tight.tokens["bg"]!), T.contrast(tight.tokens["ink-3"]!, tight.tokens["bg"]!))
    }

    func testLightPageBecomesWashes() {
        let t = T.build(.dark, ThemePalette(background: "#f7f3ea", accent: "#b4532a"))
        XCTAssertTrue(t.isLight)
        XCTAssertGreaterThan(t.fx.glassHi, 0.5)
        for g in T.pageGrounds(t.tokens, t.fx) { XCTAssertGreaterThanOrEqual(T.luminance(g.color), T.luminance(t.tokens["surface-3"]!) - 1e-9, g.name) }
        XCTAssertTrue(T.passes(t))
    }

    func testTabBarGetsMoreSolidWhenNeeded() {
        let g = Gen(77)
        var raised = 0
        for _ in 0..<40 {
            let bg = g.color()
            let accent = g.color()
            let t = T.build(.dark, ThemePalette(background: bg, accent: accent))
            XCTAssertGreaterThanOrEqual(t.fx.bar, T.dark.fx.bar)
            XCTAssertLessThanOrEqual(t.fx.bar, 1)
            if t.fx.bar > T.dark.fx.bar { raised += 1 }
            for gr in T.barGrounds(t.tokens, t.fx) { XCTAssertGreaterThanOrEqual(T.contrast(t.tokens["ink-2"]!, gr.color), 4.5, gr.name) }
        }
        XCTAssertGreaterThan(raised, 0)
    }

    func testStrengthsStayBetweenZeroAndOne() {
        let g = Gen(9)
        for _ in 0..<60 {
            for base in ThemeBase.allCases {
                let bg = g.color()
                let sf = g.color()
                let ac = g.color()
                let fx = T.build(base, ThemePalette(background: bg, surface: sf, accent: ac)).fx
                for v in fx.glow + [fx.glassHi, fx.glassLo, fx.glassSmoke, fx.glassLine, fx.tile, fx.tileLine, fx.hair, fx.bar] {
                    XCTAssertGreaterThanOrEqual(v, 0)
                    XCTAssertLessThanOrEqual(v, 1)
                }
            }
        }
    }

    // MARK: with a palette

    func testKeepsAPaletteThatAlreadyWorks() {
        let palette = ThemePalette(background: "#0b0d12", text: "#f2f4f8", accent: "#8fd0ff")
        let t = T.build(.dark, palette)
        XCTAssertTrue(t.custom)
        XCTAssertFalse(t.isLight)
        XCTAssertEqual(t.tokens["bg"], "#0b0d12")
        XCTAssertEqual(t.tokens["ink"], "#f2f4f8")
        XCTAssertEqual(t.tokens["accent"], "#8fd0ff")
        XCTAssertEqual(t.adjusted, [])
        XCTAssertEqual(failures(.dark, palette), [])
    }

    func testEveryTokenIsHex() {
        let t = T.build(.dark, ThemePalette(background: "#101820", accent: "#ff5a36"))
        for name in themeTokenNames {
            let v = t.tokens[name] ?? ""
            XCTAssertEqual(v.count, 7, name)
            XCTAssertNotNil(T.parseHex(v), name)
        }
    }

    func testSurfacesStepTowardTheText() {
        let t = T.build(.dark, ThemePalette(background: "#0a0f14")).tokens
        let l = ["bg", "surface", "surface-2", "surface-3"].map { T.luminance(t[$0]!) }
        XCTAssertGreaterThan(l[1], l[0])
        XCTAssertGreaterThan(l[2], l[1])
        XCTAssertGreaterThan(l[3], l[2])
        let light = T.build(.dark, ThemePalette(background: "#f7f3ea"))
        XCTAssertTrue(light.isLight)
        let ll = ["bg", "surface", "surface-2", "surface-3"].map { T.luminance(light.tokens[$0]!) }
        XCTAssertLessThan(ll[1], ll[0])
        XCTAssertLessThan(ll[3], ll[2])
    }

    func testPicksReadableTextWhenNoneGiven() {
        for background in ["#000000", "#101820", "#f7f3ea", "#ffffff", "#e9d8c4"] {
            let t = T.build(.dark, ThemePalette(background: background))
            XCTAssertGreaterThanOrEqual(T.contrast(t.tokens["ink"]!, t.tokens["bg"]!), 7, background)
            XCTAssertGreaterThanOrEqual(T.contrast(t.tokens["accent-ink"]!, t.tokens["accent"]!), 4.5, background)
        }
    }

    func testFixesUnreadableTextAndSaysSo() {
        let t = T.build(.dark, ThemePalette(background: "#111111", text: "#222222", muted: "#1a1a1a"))
        XCTAssertTrue(t.adjusted.contains("ink"))
        XCTAssertTrue(t.adjusted.contains("ink-2"))
        XCTAssertGreaterThanOrEqual(T.contrast(t.tokens["ink"]!, t.tokens["surface-3"]!), 7)
        XCTAssertGreaterThanOrEqual(T.contrast(t.tokens["ink-2"]!, t.tokens["surface-3"]!), 4.5)
    }

    func testMovesAnAccentTooCloseToTheBackground() {
        let t = T.build(.dark, ThemePalette(background: "#0a0a0a", accent: "#3a0d0d"))
        XCTAssertTrue(t.adjusted.contains("accent"))
        XCTAssertGreaterThanOrEqual(T.contrast(t.tokens["accent"]!, t.tokens["surface-2"]!), 4.5)
        let c = rgb(t.tokens["accent"]!)
        XCTAssertGreaterThan(c.r, c.g)
        XCTAssertGreaterThan(c.r, c.b)
    }

    func testPullsAMidToneBackgroundToOneSide() {
        let t = T.build(.dark, ThemePalette(background: "#808080"))
        XCTAssertTrue(t.adjusted.contains("bg"))
        XCTAssertEqual(failures(.dark, ThemePalette(background: "#808080")), [])
    }

    func testASurfaceDoesNotFightTheBackground() {
        let p = ThemePalette(background: "#0a0a0a", surface: "#ffffff")
        let t = T.build(.dark, p)
        XCTAssertTrue(t.adjusted.contains("surface"))
        XCTAssertLessThan(T.luminance(t.tokens["surface"]!), 0.1)
        XCTAssertEqual(failures(.dark, p), [])
    }

    func testBlackOrWhiteOnTheAccent() {
        XCTAssertLessThan(T.luminance(T.build(.dark, ThemePalette(accent: "#ffe14d")).tokens["accent-ink"]!), 0.1)
        let onDark = T.build(.dark, ThemePalette(background: "#fafafa", accent: "#1d3fbf")).tokens
        XCTAssertGreaterThan(T.luminance(onDark["accent-ink"]!), 0.7)
    }

    func testAnyPaletteGivesAUsableTheme() {
        let g = Gen(20261005)
        for _ in 0..<120 {
            let p = ThemePalette(background: g.maybe(), surface: g.maybe(), text: g.maybe(), muted: g.maybe(), accent: g.maybe())
            for base in ThemeBase.allCases {
                XCTAssertEqual(failures(base, p), [], "\(base) \(p)")
            }
        }
    }

    func testWorstCaseEverythingTheSameColor() {
        for c in ["#000000", "#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff", "#777777", "#c8f73a"] {
            let p = ThemePalette(background: c, surface: c, text: c, muted: c, accent: c)
            for base in ThemeBase.allCases { XCTAssertEqual(failures(base, p), [], "\(base) \(c)") }
        }
    }

    func testHighContrastWithAPaletteHoldsSevenToOne() {
        let t = T.build(.contrast, ThemePalette(background: "#14213d", text: "#e5e5e5", accent: "#fca311"))
        XCTAssertGreaterThanOrEqual(T.audit(t).map { $0.ratio }.min() ?? 0, 7)
        XCTAssertLessThanOrEqual(T.luminance(t.tokens["bg"]!), 0.012)
    }
}
