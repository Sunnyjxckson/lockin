import XCTest
@testable import LockInKit

final class BoardsCoreTests: XCTestCase {
    typealias B = BoardsCore
    typealias T = ThemeBuild

    // MARK: synthetic images

    /// A deterministic random number source, so noisy test images are the same every run.
    final class Rand {
        var s: UInt32
        init(_ seed: UInt32) { s = seed }
        func next() -> Double {
            s = s &* 1664525 &+ 1013904223
            return Double(s) / 4294967296.0
        }
    }

    /// An RGBA image made of flat areas. `parts` are (hex, share of the pixels). `noise` jitters each channel by up to that much.
    func image(_ parts: [(String, Double)], size: Int = 64, noise: Double = 0, seed: UInt32 = 7) -> [UInt8] {
        let n = size * size
        var out = [UInt8](repeating: 0, count: n * 4)
        let rand = Rand(seed)
        var at = 0
        func clamp(_ v: Double) -> UInt8 { return UInt8(Swift.min(255, Swift.max(0, v))) }
        for (index, part) in parts.enumerated() {
            let rgb = T.parseHex(part.0)!
            let end = index == parts.count - 1 ? n : Swift.min(n, at + Int(MealsCore.jsRound(part.1 * Double(n))))
            while at < end {
                func j() -> Double { return noise != 0 ? MealsCore.jsRound((rand.next() * 2 - 1) * noise) : 0 }
                out[at * 4] = clamp(rgb.r + j())
                out[at * 4 + 1] = clamp(rgb.g + j())
                out[at * 4 + 2] = clamp(rgb.b + j())
                out[at * 4 + 3] = 255
                at += 1
            }
        }
        return out
    }

    func near(_ palette: [String], _ hex: String, _ within: Double = 0.03) -> Bool {
        return palette.contains { B.colorDistance($0, hex) <= within }
    }

    // MARK: color math

    func testRoundTripsThroughOKLab() {
        for hex in ["#000000", "#ffffff", "#c8f73a", "#8a1f1f", "#3366cc", "#7f7f7f"] {
            XCTAssertEqual(B.labToHex(B.hexToLab(hex)), hex)
        }
    }

    func testMeasuresLightnessAndColorfulness() {
        XCTAssertEqual(B.hexToLab("#ffffff").l, 1, accuracy: 0.001)
        XCTAssertEqual(B.hexToLab("#000000").l, 0, accuracy: 0.001)
        XCTAssertLessThan(B.chroma("#808080"), 0.001)
        XCTAssertGreaterThan(B.chroma("#ff0000"), 0.2)
        XCTAssertLessThan(B.colorDistance("#101010", "#111111"), 0.01)
        XCTAssertGreaterThan(B.colorDistance("#ff0000", "#0000ff"), 0.4)
    }

    func testDedupesAndKeepsOrder() {
        XCTAssertEqual(B.dedupeColors(["#ff0000", "#fe0101", "nope", nil, "#00F", "#ff0000"] as [String?]), ["#ff0000", "#0000ff"])
    }

    func testSortsDarkToLight() {
        XCTAssertEqual(B.sortByLightness(["#ffffff", "#000000", "#808080"]), ["#000000", "#808080", "#ffffff"])
    }

    func testLabelColorReadsOnAnySwatch() {
        for c in ["#000000", "#ffffff", "#c8f73a", "#8a1f1f", "#777777", "#f4d9e2"] {
            XCTAssertGreaterThanOrEqual(T.contrast(B.inkOnColor(c), c), 4.5, c)
        }
    }

    // MARK: extractPalette

    func testFindsTheKnownColorsOfAFlatImage() {
        let p = B.extractPalette(image([("#1a1a2e", 0.5), ("#e94560", 0.3), ("#f5f0e1", 0.2)]))
        XCTAssertEqual(p.count, 3)
        XCTAssertLessThan(B.colorDistance(p[0], "#1a1a2e"), 0.01)
        XCTAssertLessThan(B.colorDistance(p[1], "#e94560"), 0.01)
        XCTAssertLessThan(B.colorDistance(p[2], "#f5f0e1"), 0.01)
    }

    func testOneColorImage() {
        XCTAssertEqual(B.extractPalette(image([("#336699", 1)])), ["#336699"])
    }

    func testSeesThroughNoise() {
        let p = B.extractPalette(image([("#22313f", 0.45), ("#d9a441", 0.3), ("#7a8b6f", 0.25)], size: 64, noise: 10))
        XCTAssertGreaterThanOrEqual(p.count, 3)
        XCTAssertLessThanOrEqual(p.count, 4)
        XCTAssertLessThan(B.colorDistance(p[0], "#22313f"), 0.04)
        XCTAssertTrue(near(p, "#d9a441", 0.04))
        XCTAssertTrue(near(p, "#7a8b6f", 0.04))
    }

    func testMergesShadesTheEyeReadsAsOne() {
        let p = B.extractPalette(image([("#101010", 0.3), ("#131313", 0.3), ("#0e0e0e", 0.2), ("#c8f73a", 0.2)]))
        XCTAssertEqual(p.count, 2)
        XCTAssertTrue(near(p, "#c8f73a", 0.01))
    }

    func testKeepsASmallVividPopAndDropsADullSliver() {
        let p = B.extractPalette(image([("#f2f2f0", 0.6), ("#1c1c1c", 0.382), ("#ff2a1a", 0.01), ("#8d8d8a", 0.008)]))
        XCTAssertTrue(near(p, "#ff2a1a", 0.03))
        XCTAssertFalse(near(p, "#8d8d8a", 0.03))
    }

    func testNeverReturnsTwoColorsThatLookTheSame() {
        var parts: [(String, Double)] = []
        for i in 0..<12 {
            let d = Double(i)
            parts.append((B.labToHex(Lab(0.25 + d * 0.05, 0.1 * cos(d), 0.1 * sin(d))), 1.0 / 12.0))
        }
        let p = B.extractPalette(image(parts, size: 60), max: 5)
        XCTAssertLessThanOrEqual(p.count, 5)
        for i in 0..<p.count {
            for j in (i + 1)..<Swift.max(i + 1, p.count) { XCTAssertGreaterThan(B.colorDistance(p[i], p[j]), 0.02) }
        }
    }

    func testSummarizesAGradientInAFewSteps() {
        let size = 64
        var px = [UInt8](repeating: 0, count: size * size * 4)
        for y in 0..<size {
            for x in 0..<size {
                let i = (y * size + x) * 4
                px[i] = UInt8(x * 4)
                px[i + 1] = UInt8(x * 4)
                px[i + 2] = UInt8(x * 4)
                px[i + 3] = 255
            }
        }
        let p = B.extractPalette(px)
        XCTAssertGreaterThanOrEqual(p.count, 3)
        XCTAssertLessThanOrEqual(p.count, 6)
        let l = p.map { T.luminance($0) }
        XCTAssertLessThan(l.min() ?? 1, 0.05)
        XCTAssertGreaterThan(l.max() ?? 0, 0.6)
    }

    func testIgnoresTransparentPixelsAndCopesWithNothing() {
        var px = image([("#ff0000", 0.5), ("#0000ff", 0.5)], size: 16)
        var i = 0
        while i < px.count / 2 {
            px[i + 3] = 0
            i += 4
        }
        XCTAssertEqual(B.extractPalette(px), ["#0000ff"])
        XCTAssertEqual(B.extractPalette([]), [])
        XCTAssertEqual(B.extractPalette([UInt8](repeating: 0, count: 16)), [])
    }

    func testSameAnswerEveryTime() {
        let px = image([("#22313f", 0.4), ("#d9a441", 0.3), ("#7a8b6f", 0.2), ("#efe6d5", 0.1)], size: 48, noise: 14, seed: 99)
        XCTAssertEqual(B.extractPalette(px), B.extractPalette(px))
    }

    func testColorAt() {
        let px = image([("#ff0000", 0.5), ("#0000ff", 0.5)], size: 10)
        XCTAssertEqual(B.colorAt(px, width: 10, height: 10, x: 0.5, y: 0.1), "#ff0000")
        XCTAssertEqual(B.colorAt(px, width: 10, height: 10, x: 0.5, y: 0.9), "#0000ff")
        XCTAssertEqual(B.colorAt(px, width: 10, height: 10, x: 2, y: 2), "#0000ff")
        XCTAssertEqual(B.colorAt(px, width: 10, height: 10, x: -1, y: -1), "#ff0000")
        XCTAssertNil(B.colorAt(px, width: 0, height: 0, x: 0.5, y: 0.5))
    }

    // MARK: boardPalette

    func item(_ kind: BoardItemKind, _ order: Int, _ color: String?, _ palette: [String]?) -> BoardItem {
        return BoardItem(id: "i\(order)", boardId: "b", kind: kind, color: color, palette: palette, sortOrder: order)
    }

    func testKeptSwatchesFirstThenEachImagesMainColor() {
        let p = B.boardPalette([
            item(.image, 0, nil, ["#111111", "#ff0000"]),
            item(.color, 2, "#00ff00", nil),
            item(.image, 1, nil, ["#eeeeee", "#0000ff"]),
            item(.note, 3, nil, nil),
        ])
        XCTAssertEqual(p, ["#00ff00", "#111111", "#eeeeee", "#ff0000", "#0000ff"])
    }

    func testDropsRepeatsAndCapsTheCount() {
        XCTAssertEqual(B.boardPalette([item(.image, 0, nil, ["#111111"]), item(.image, 1, nil, ["#121212", "#ff0000"])]), ["#111111", "#ff0000"])
        var many: [BoardItem] = []
        for i in 0..<20 {
            let d = Double(i)
            many.append(item(.color, i, B.labToHex(Lab(0.2 + d * 0.03, 0.15 * cos(d), 0.15 * sin(d))), nil))
        }
        XCTAssertEqual(B.boardPalette(many, max: 6).count, 6)
    }

    // MARK: autoRoles

    let awkward: [String: [String]] = [
        "pastels": ["#f8d7e3", "#d7e8f8", "#e3f8d7", "#f8f1d7", "#e6d7f8"],
        "nearBlack": ["#0a0a0b", "#111114", "#16130f", "#1a1a1a", "#0d1014"],
        "oneRed": ["#e10600"],
        "earth": ["#8b7355", "#6b5b45", "#a0522d", "#556b2f", "#c2b280"],
        "studio": ["#f4f1ea", "#1b1b1b", "#b08d57"],
    ]

    func testNoColorsLeavesEverythingToTheBase() {
        XCTAssertEqual(B.autoRoles([]), RoleChoice())
    }

    func testOneSaturatedColorIsTheAccent() {
        XCTAssertEqual(B.autoRoles(awkward["oneRed"]!), RoleChoice(accent: "#e10600"))
    }

    func testPastelsGoLight() {
        let r = B.autoRoles(awkward["pastels"]!)
        XCTAssertNotNil(r.background)
        XCTAssertTrue(T.build(.dark, B.rolesToPalette(r)).isLight)
        XCTAssertNotEqual(r.accent, r.background)
    }

    func testNearBlacksGoDark() {
        let r = B.autoRoles(awkward["nearBlack"]!)
        XCTAssertEqual(r.background, "#0a0a0b")
        XCTAssertFalse(T.build(.dark, B.rolesToPalette(r)).isLight)
    }

    func testAccentIsMostColorfulAndTextIsFar() {
        let r = B.autoRoles(awkward["studio"]!)
        XCTAssertEqual(r.accent, "#b08d57")
        XCTAssertEqual(r.background, "#f4f1ea")
        XCTAssertEqual(r.text, "#1b1b1b")
        let earth = B.autoRoles(awkward["earth"]!)
        XCTAssertEqual(earth.accent, "#a0522d")
        XCTAssertEqual(earth.background, "#6b5b45")
        XCTAssertEqual(earth.text, "#c2b280")
    }

    func testNeverUsesOneColorForTwoRoles() {
        for colors in awkward.values {
            let r = B.autoRoles(colors)
            let used = ThemeRole.allCases.compactMap { r[$0] }
            XCTAssertEqual(Set(used).count, used.count)
        }
    }

    func testAwkwardPalettesGiveThemesThatPass() {
        for (name, colors) in awkward {
            for base in ThemeBase.allCases {
                let theme = T.build(base, B.rolesToPalette(B.autoRoles(colors, base: base)))
                let failed = T.audit(theme).filter { !$0.pass }
                XCTAssertEqual(failed.count, 0, "\(name) on \(base)")
            }
        }
    }

    // MARK: roleShifts

    func testNothingNoticeableWhenUsedAsPicked() {
        let roles = RoleChoice(background: "#0a0a0b", surface: nil, text: "#f2efe8", accent: "#c8f73a")
        let shifts = B.roleShifts(roles, T.build(.dark, B.rolesToPalette(roles)))
        XCTAssertEqual(shifts.map { $0.role }, [.background, .text, .accent])
        XCTAssertTrue(shifts.allSatisfy { !$0.noticeable })
    }

    func testSaysWhenAColorHadToMove() {
        let roles = RoleChoice(background: "#6b5b45", surface: nil, text: nil, accent: "#3a0d0d")
        let shifts = B.roleShifts(roles, T.build(.dark, B.rolesToPalette(roles)))
        let bg = shifts.first { $0.role == .background }!
        let accent = shifts.first { $0.role == .accent }!
        XCTAssertTrue(bg.noticeable)
        XCTAssertTrue(bg.why.hasPrefix("Darkened"))
        XCTAssertTrue(accent.noticeable)
        XCTAssertTrue(accent.why.hasPrefix("Lightened"))
        XCTAssertNotEqual(accent.used, accent.asked)
    }

    func testSkipsRolesLeftToTheBase() {
        XCTAssertEqual(B.roleShifts(RoleChoice(), T.build(.dark)), [])
    }

    // MARK: boards

    func testCleansNames() {
        XCTAssertEqual(B.cleanBoardName("  Rick   season ", .brand), "Rick season")
        XCTAssertEqual(B.cleanBoardName("   ", .body), "Body board")
        XCTAssertEqual(B.cleanBoardName(String(repeating: "x", count: 80), .life).count, 40)
    }

    func testReadsLinks() {
        XCTAssertEqual(B.cleanLink("ssense.com/en-us/men"), "https://ssense.com/en-us/men")
        XCTAssertEqual(B.cleanLink(" https://www.rickowens.eu/ "), "https://www.rickowens.eu/")
        XCTAssertNil(B.cleanLink("just a note"))
        XCTAssertNil(B.cleanLink("javascript:alert(1)"))
        XCTAssertNil(B.cleanLink(""))
        XCTAssertEqual(B.cleanLink("ssense.com"), "https://ssense.com/")
        XCTAssertEqual(B.linkHost("https://www.rickowens.eu/en/US"), "rickowens.eu")
        XCTAssertNil(B.linkHost("nope"))
    }

    func testMovesAnIdAndWritesOnlyChangedRows() {
        XCTAssertEqual(B.moveId(["a", "b", "c", "d"], "d", to: 1), ["a", "d", "b", "c"])
        XCTAssertEqual(B.moveId(["a", "b", "c"], "a", to: 99), ["b", "c", "a"])
        XCTAssertEqual(B.moveId(["a", "b"], "zz", to: 0), ["a", "b"])
        let rows: [(id: String, sortOrder: Int)] = [("a", 0), ("b", 1), ("c", 2)]
        let patches = B.orderPatches(["a", "c", "b"], current: rows)
        XCTAssertEqual(patches.map { $0.id }, ["c", "b"])
        XCTAssertEqual(patches.map { $0.sortOrder }, [1, 2])
        XCTAssertEqual(B.orderPatches(["a", "b", "c"], current: rows).count, 0)
    }

    func testPicksTheCover() {
        let items = [
            BoardItem(id: "n", kind: .note, sortOrder: 0),
            BoardItem(id: "i2", kind: .image, sortOrder: 2),
            BoardItem(id: "i1", kind: .image, sortOrder: 1),
        ]
        XCTAssertEqual(B.coverOf(nil, items)?.id, "i1")
        XCTAssertEqual(B.coverOf("i2", items)?.id, "i2")
        XCTAssertEqual(B.coverOf("n", items)?.id, "i1")
        XCTAssertNil(B.coverOf(nil, [items[0]]))
    }

    // MARK: layoutBoard

    func img(_ id: String, _ aspect: Double) -> TileInput { return TileInput(id: id, kind: .image, aspect: aspect) }
    let W = 366.0

    func overlaps(_ a: TileRect, _ b: TileRect) -> Bool {
        return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    }

    func tile(_ l: BoardLayout, _ id: String) -> TileRect { return l.tiles.first { $0.id == id }! }

    func testEmptyBoard() {
        XCTAssertEqual(B.layoutBoard([], width: W), BoardLayout(tiles: [], height: 0))
    }

    func testOpensWithTheFirstImageAtFullWidth() {
        let l = B.layoutBoard([img("a", 1.25), img("b", 0.8)], width: W)
        XCTAssertEqual(l.tiles[0].x, 0)
        XCTAssertEqual(l.tiles[0].y, 0)
        XCTAssertEqual(l.tiles[0].w, W)
        XCTAssertTrue(l.tiles[0].span)
        XCTAssertEqual(l.tiles[0].w / l.tiles[0].h, 1.25, accuracy: 0.05)
    }

    func testMixedBoardStaysInsideWithNoOverlaps() {
        let rand = Rand(3)
        var items: [TileInput] = []
        for i in 0..<40 {
            let r = rand.next()
            if r < 0.2 {
                items.append(TileInput(id: "c\(i)", kind: .color))
            } else if r < 0.35 {
                items.append(TileInput(id: "n\(i)", kind: .note, chars: Int(MealsCore.jsRound(rand.next() * 200))))
            } else {
                items.append(img("i\(i)", 0.5 + rand.next() * 1.6))
            }
        }
        let l = B.layoutBoard(items, width: W)
        XCTAssertEqual(l.tiles.count, items.count)
        for t in l.tiles {
            XCTAssertGreaterThanOrEqual(t.x, 0)
            XCTAssertLessThanOrEqual(t.x + t.w, W)
            XCTAssertLessThanOrEqual(t.y + t.h, l.height)
            XCTAssertGreaterThan(t.h, 0)
        }
        for i in 0..<l.tiles.count {
            for j in (i + 1)..<Swift.max(i + 1, l.tiles.count) { XCTAssertFalse(overlaps(l.tiles[i], l.tiles[j]), "\(i) and \(j)") }
        }
    }

    func testTwoUnevenColumnsThatSwapSides() {
        let l = B.layoutBoard([img("hero", 1), img("a", 1), img("b", 1), img("wide", 2), img("c", 1), img("d", 1)], width: W, gap: 6)
        let a = tile(l, "a"), b = tile(l, "b"), c = tile(l, "c"), d = tile(l, "d")
        XCTAssertNotEqual(a.w, b.w)
        XCTAssertEqual(a.w + b.w + 6, W)
        XCTAssertTrue(tile(l, "wide").span)
        XCTAssertEqual(a.x, 0)
        XCTAssertLessThan(a.w, b.w)
        XCTAssertGreaterThan(c.w, d.w)
    }

    func testLeavesNoHoleAboveAFullWidthPiece() {
        let l = B.layoutBoard([img("hero", 1), img("a", 1), img("b", 1), img("wide", 2)], width: W, gap: 6)
        let a = tile(l, "a"), b = tile(l, "b"), wide = tile(l, "wide")
        XCTAssertTrue(wide.span)
        XCTAssertEqual(a.y + a.h, b.y + b.h)
        XCTAssertEqual(wide.y, a.y + a.h + 6)
        XCTAssertTrue(a.stretched || b.stretched)
    }

    func testAWideImageTakesAColumnWhenTheHoleIsTooBig() {
        let l = B.layoutBoard([img("hero", 1), img("tall", 0.5), img("wide", 2)], width: W)
        XCTAssertFalse(tile(l, "wide").span)
        XCTAssertFalse(tile(l, "tall").stretched)
    }

    func testClampsExtremeShapes() {
        let l = B.layoutBoard([img("hero", 1), img("strip", 0.05), img("pano", 30)], width: W, hero: false)
        for t in l.tiles { XCTAssertLessThanOrEqual(t.h, t.w / 0.5 + 1) }
    }

    func testFindsTheTileUnderAPoint() {
        let l = B.layoutBoard([img("a", 1), img("b", 1), img("c", 1)], width: W)
        XCTAssertEqual(B.tileAt(l, x: 10, y: 10)?.id, "a")
        let b = l.tiles[1]
        XCTAssertEqual(B.tileAt(l, x: b.x + 5, y: b.y + 5)?.id, "b")
        XCTAssertNil(B.tileAt(l, x: -5, y: -5))
    }
}
