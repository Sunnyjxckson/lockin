import Foundation

// Mood boards. Pure rules, no UI and no db. Port of src/lib/logic/boards.ts.
//
// - Color math in OKLab, a perceptual space, so "close" means close to the eye.
// - extractPalette: the main colors of an image from its raw pixels.
// - autoRoles: which palette color plays background, surface, text and accent.
// - roleShifts: where the theme had to move a color to stay readable.
// - layoutBoard: the collage. Two uneven columns that swap sides after every full width piece,
//   each tile at its own aspect ratio.
// - reorder helpers.

public struct Lab: Equatable {
    public var l: Double
    public var a: Double
    public var b: Double
    public init(_ l: Double, _ a: Double, _ b: Double) {
        self.l = l
        self.a = a
        self.b = b
    }
}

public enum ThemeRole: String, CaseIterable {
    case background
    case surface
    case text
    case accent

    public var label: String {
        switch self {
        case .background: return "Background"
        case .surface: return "Cards"
        case .text: return "Text"
        case .accent: return "Accent"
        }
    }

    public var token: String {
        switch self {
        case .background: return "bg"
        case .surface: return "surface"
        case .text: return "ink"
        case .accent: return "accent"
        }
    }
}

public struct RoleChoice: Equatable {
    public var background: String?
    public var surface: String?
    public var text: String?
    public var accent: String?

    public init(background: String? = nil, surface: String? = nil, text: String? = nil, accent: String? = nil) {
        self.background = background
        self.surface = surface
        self.text = text
        self.accent = accent
    }

    public subscript(role: ThemeRole) -> String? {
        get {
            switch role {
            case .background: return background
            case .surface: return surface
            case .text: return text
            case .accent: return accent
            }
        }
        set {
            switch role {
            case .background: background = newValue
            case .surface: surface = newValue
            case .text: text = newValue
            case .accent: accent = newValue
            }
        }
    }
}

public struct RoleShift: Equatable {
    public var role: ThemeRole
    public var asked: String
    public var used: String
    public var distance: Double
    /// True when the eye would notice the difference.
    public var noticeable: Bool
    /// Plain words for what happened.
    public var why: String
}

public struct TileInput: Equatable {
    public enum Kind: Equatable {
        case image
        case color
        case note
    }

    public var id: String
    public var kind: Kind
    /// Width over height. Images only.
    public var aspect: Double?
    /// Length of a note's text, to size its tile.
    public var chars: Int
    /// A note that carries a link.
    public var link: Bool

    public init(id: String, kind: Kind, aspect: Double? = nil, chars: Int = 0, link: Bool = false) {
        self.id = id
        self.kind = kind
        self.aspect = aspect
        self.chars = chars
        self.link = link
    }
}

public struct TileRect: Equatable {
    public var id: String
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double
    /// True when the tile runs the full width.
    public var span: Bool
    /// True when the tile was made taller or shorter than its own shape to close a gap. Images are cropped to fit.
    public var stretched: Bool
}

public struct BoardLayout: Equatable {
    public var tiles: [TileRect]
    public var height: Double
}

public struct NoteMetrics: Equatable {
    public var fontSize: Double
    public var lineHeight: Double
    public var lines: Int
    public var height: Double
}

public enum BoardsCore {
    typealias T = ThemeBuild

    // MARK: color

    static func linear(_ c: Double) -> Double {
        let v = c / 255
        return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
    }

    static func gamma(_ v: Double) -> Double {
        let c = v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1 / 2.4) - 0.055
        return Swift.min(255, Swift.max(0, c * 255))
    }

    /// sRGB (0 to 255 each) to OKLab. L runs 0 to 1.
    public static func rgbToLab(_ r: Double, _ g: Double, _ b: Double) -> Lab {
        let lr = linear(r)
        let lg = linear(g)
        let lb = linear(b)
        let l = cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
        let m = cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
        let s = cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
        return Lab(
            0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
        )
    }

    public static func labToRgb(_ lab: Lab) -> RGB {
        let l = pow(lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b, 3)
        let m = pow(lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b, 3)
        let s = pow(lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b, 3)
        return RGB(
            gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
        )
    }

    public static func hexToLab(_ hex: String) -> Lab {
        let rgb = T.parseHex(hex) ?? RGB(128, 128, 128)
        return rgbToLab(rgb.r, rgb.g, rgb.b)
    }

    public static func labToHex(_ lab: Lab) -> String {
        return T.toHex(labToRgb(lab))
    }

    /// Distance in OKLab. About 0.02 is the smallest step most people see.
    public static func labDistance(_ a: Lab, _ b: Lab) -> Double {
        let dl = a.l - b.l
        let da = a.a - b.a
        let db = a.b - b.b
        return (dl * dl + da * da + db * db).squareRoot()
    }

    public static func colorDistance(_ a: String, _ b: String) -> Double {
        return labDistance(hexToLab(a), hexToLab(b))
    }

    /// How colorful, 0 for gray. A vivid red is near 0.25.
    public static func chroma(_ hex: String) -> Double {
        let lab = hexToLab(hex)
        return (lab.a * lab.a + lab.b * lab.b).squareRoot()
    }

    /// Hue angle in degrees, 0 to 360.
    public static func hue(_ hex: String) -> Double {
        let lab = hexToLab(hex)
        let h = atan2(lab.b, lab.a) * 180 / Double.pi
        return h < 0 ? h + 360 : h
    }

    /// A dark or light ink, tinted with the color, that reads on top of it. For labels drawn on a swatch.
    public static func inkOnColor(_ hex: String) -> String {
        let c = T.normalizeHex(hex) ?? "#808080"
        let dark = T.mix(c, "#000000", 0.86)
        let light = T.mix(c, "#ffffff", 0.92)
        let pick = T.contrast(dark, c) >= T.contrast(light, c) ? dark : light
        if T.contrast(pick, c) >= 4.5 { return pick }
        return T.contrast("#000000", c) >= T.contrast("#ffffff", c) ? "#000000" : "#ffffff"
    }

    /// Drop colors that sit within `min` of one already kept. Order is kept.
    public static func dedupeColors(_ colors: [String?], _ minDistance: Double = 0.045) -> [String] {
        var out: [(hex: String, lab: Lab)] = []
        for raw in colors {
            guard let hex = T.normalizeHex(raw) else { continue }
            let lab = hexToLab(hex)
            if out.contains(where: { labDistance($0.lab, lab) < minDistance }) { continue }
            out.append((hex, lab))
        }
        return out.map { $0.hex }
    }

    public static func dedupeColors(_ colors: [String], _ minDistance: Double = 0.045) -> [String] {
        return dedupeColors(colors.map { Optional($0) }, minDistance)
    }

    /// Dark to light, for showing a palette as one strip.
    public static func sortByLightness(_ colors: [String]) -> [String] {
        let withLight = colors.enumerated().map { (i: $0.offset, c: $0.element, l: hexToLab($0.element).l) }
        return withLight.sorted { $0.l != $1.l ? $0.l < $1.l : $0.i < $1.i }.map { $0.c }
    }

    // MARK: palette extraction

    struct Cluster {
        var lab: Lab
        var weight: Double
    }

    /// The main colors of an image, most dominant first, as "#rrggbb".
    ///
    /// `pixels` is RGBA, four bytes a pixel. Hand in a small copy of the image (64 to 96 pixels on the
    /// long side is plenty).
    ///
    /// How: pixels are binned into a coarse RGB histogram, the bins are clustered by k-means in OKLab
    /// starting from spread out seeds, clusters that look the same are merged, and slivers are dropped
    /// unless they are a vivid pop of color, which is often the one a designer wants.
    public static func extractPalette(_ pixels: [UInt8], max maxColors: Int = 6, merge: Double = 0.07) -> [String] {
        let maxN = Swift.max(1, maxColors)

        // 1. Histogram, 5 bits a channel. Keeps the real mean color of every bin, in first seen order.
        var order: [Int] = []
        var sums: [Int: (r: Double, g: Double, b: Double, n: Double)] = [:]
        var total = 0.0
        var i = 0
        while i + 3 < pixels.count {
            if pixels[i + 3] < 128 {
                i += 4
                continue
            }
            let r = Int(pixels[i])
            let g = Int(pixels[i + 1])
            let b = Int(pixels[i + 2])
            let key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
            if var s = sums[key] {
                s.r += Double(r)
                s.g += Double(g)
                s.b += Double(b)
                s.n += 1
                sums[key] = s
            } else {
                sums[key] = (Double(r), Double(g), Double(b), 1)
                order.append(key)
            }
            total += 1
            i += 4
        }
        if total == 0 { return [] }
        var bins: [Cluster] = []
        for key in order {
            guard let s = sums[key] else { continue }
            bins.append(Cluster(lab: rgbToLab(s.r / s.n, s.g / s.n, s.b / s.n), weight: s.n / total))
        }
        bins = bins.enumerated().sorted { $0.element.weight != $1.element.weight ? $0.element.weight > $1.element.weight : $0.offset < $1.offset }.map { $0.element }

        // 2. Seeds: the heaviest bin, then whichever bin is far from every seed and not too rare.
        let k = Swift.min(Swift.max(maxN + 2, 8), bins.count)
        var seeds: [Lab] = [bins[0].lab]
        var nearest = bins.map { labDistance($0.lab, seeds[0]) }
        while seeds.count < k {
            var best = -1
            var bestScore = 0.0
            for idx in 0..<bins.count {
                let score = nearest[idx] * nearest[idx] * bins[idx].weight.squareRoot()
                if score > bestScore {
                    bestScore = score
                    best = idx
                }
            }
            if best < 0 { break }
            let seed = bins[best].lab
            seeds.append(seed)
            for idx in 0..<bins.count { nearest[idx] = Swift.min(nearest[idx], labDistance(bins[idx].lab, seed)) }
        }

        // 3. k-means, weighted by how many pixels each bin holds.
        var centers = seeds
        var weights = [Double](repeating: 0, count: centers.count)
        for _ in 0..<16 {
            var acc = [[Double]](repeating: [0, 0, 0, 0], count: centers.count)
            for bin in bins {
                var at = 0
                var d = Double.infinity
                for c in 0..<centers.count {
                    let dc = labDistance(bin.lab, centers[c])
                    if dc < d {
                        d = dc
                        at = c
                    }
                }
                acc[at][0] += bin.lab.l * bin.weight
                acc[at][1] += bin.lab.a * bin.weight
                acc[at][2] += bin.lab.b * bin.weight
                acc[at][3] += bin.weight
            }
            var moved = 0.0
            var next: [Lab] = []
            var nextWeights: [Double] = []
            for c in 0..<centers.count {
                let a = acc[c]
                if a[3] == 0 { continue }
                let center = Lab(a[0] / a[3], a[1] / a[3], a[2] / a[3])
                moved = Swift.max(moved, labDistance(center, centers[c]))
                next.append(center)
                nextWeights.append(a[3])
            }
            centers = next
            weights = nextWeights
            if moved < 0.002 { break }
        }

        // 4. Merge clusters the eye reads as one color, heaviest first.
        var clusters: [Cluster] = []
        for (idx, lab) in centers.enumerated() { clusters.append(Cluster(lab: lab, weight: weights[idx])) }
        clusters = clusters.enumerated().sorted { $0.element.weight != $1.element.weight ? $0.element.weight > $1.element.weight : $0.offset < $1.offset }.map { $0.element }
        var merged = true
        while merged {
            merged = false
            outer: for a in 0..<clusters.count {
                var b = a + 1
                while b < clusters.count {
                    if labDistance(clusters[a].lab, clusters[b].lab) >= merge {
                        b += 1
                        continue
                    }
                    let ca = clusters[a]
                    let cb = clusters[b]
                    let w = ca.weight + cb.weight
                    clusters[a].lab = Lab(
                        (ca.lab.l * ca.weight + cb.lab.l * cb.weight) / w,
                        (ca.lab.a * ca.weight + cb.lab.a * cb.weight) / w,
                        (ca.lab.b * ca.weight + cb.lab.b * cb.weight) / w
                    )
                    clusters[a].weight = w
                    clusters.remove(at: b)
                    merged = true
                    break outer
                }
            }
        }
        clusters = clusters.enumerated().sorted { $0.element.weight != $1.element.weight ? $0.element.weight > $1.element.weight : $0.offset < $1.offset }.map { $0.element }

        // 5. Drop slivers, except a vivid one.
        var kept: [Cluster] = []
        for (idx, c) in clusters.enumerated() {
            if idx == 0 {
                kept.append(c)
                continue
            }
            let vivid = (c.lab.a * c.lab.a + c.lab.b * c.lab.b).squareRoot() > 0.11
            if c.weight >= (vivid ? 0.004 : 0.015) { kept.append(c) }
        }
        return dedupeColors(kept.prefix(maxN).map { labToHex($0.lab) }, 0.02)
    }

    /// The exact color at a point of an RGBA image. x and y run 0 to 1. Averages a small square so one noisy pixel does not decide.
    public static func colorAt(_ pixels: [UInt8], width: Int, height: Int, x: Double, y: Double, radius: Int = 1) -> String? {
        if width <= 0 || height <= 0 { return nil }
        let cx = Swift.min(width - 1, Swift.max(0, Int((x * Double(width)).rounded(.down))))
        let cy = Swift.min(height - 1, Swift.max(0, Int((y * Double(height)).rounded(.down))))
        var r = 0.0, g = 0.0, b = 0.0, n = 0.0
        for py in (cy - radius)...(cy + radius) {
            for px in (cx - radius)...(cx + radius) {
                if px < 0 || py < 0 || px >= width || py >= height { continue }
                let i = (py * width + px) * 4
                if i + 3 >= pixels.count { continue }
                if pixels[i + 3] < 128 { continue }
                r += Double(pixels[i])
                g += Double(pixels[i + 1])
                b += Double(pixels[i + 2])
                n += 1
            }
        }
        return n == 0 ? nil : T.toHex(RGB(r / n, g / n, b / n))
    }

    // MARK: a board's palette

    /// Every color on a board: the swatches kept on it first, then the colors of its images. Near duplicates are dropped.
    public static func boardPalette(_ items: [BoardItem], max maxColors: Int = 10) -> [String] {
        let sorted = items.enumerated().sorted { $0.element.sortOrder != $1.element.sortOrder ? $0.element.sortOrder < $1.element.sortOrder : $0.offset < $1.offset }.map { $0.element }
        let kept: [String] = sorted.filter { $0.kind == .color }.compactMap { $0.color }
        // Take the images' colors a rank at a time, so every image gets its main color in before any gets its sixth.
        var fromImages: [String] = []
        let palettes: [[String]] = sorted.filter { $0.kind == .image && $0.palette != nil }.map { $0.palette ?? [] }
        for rank in 0..<8 {
            for p in palettes where rank < p.count { fromImages.append(p[rank]) }
        }
        // Swatches were chosen one by one, so only true repeats go. Image colors are merged harder, and never repeat a swatch.
        let chosen = dedupeColors(kept, 0.02)
        let rest = dedupeColors(chosen + fromImages, 0.06).filter { !chosen.contains($0) }
        return Array((chosen + rest).prefix(maxColors))
    }

    // MARK: palette to theme roles

    /// A sensible first pick of which color does what. Nil leaves a role to the base theme.
    ///
    /// - Accent: the most colorful one.
    /// - Background: a color that is already dark or already light, whichever the palette leads with.
    /// - Text: whatever stands furthest from the background.
    /// - Cards: a close neighbor of the background, when there is one.
    public static func autoRoles(_ colors: [String], base: ThemeBase = .dark) -> RoleChoice {
        let list = dedupeColors(colors, 0.02)
        if list.isEmpty { return RoleChoice() }
        var out = RoleChoice()

        let byChroma = list.enumerated().sorted { chroma($0.element) != chroma($1.element) ? chroma($0.element) > chroma($1.element) : $0.offset < $1.offset }.map { $0.element }
        if chroma(byChroma[0]) >= 0.02 { out.accent = byChroma[0] }
        var rest = list.filter { $0 != out.accent }

        func isDark(_ c: String) -> Bool { return T.luminance(c) < 0.18 }
        func isLight(_ c: String) -> Bool { return T.luminance(c) > 0.5 }
        if let lead = rest.first(where: { isDark($0) || isLight($0) }) {
            let leadDark = isDark(lead)
            let side = rest.filter { leadDark ? isDark($0) : isLight($0) }
                .enumerated().sorted { T.luminance($0.element) != T.luminance($1.element) ? T.luminance($0.element) < T.luminance($1.element) : $0.offset < $1.offset }.map { $0.element }
            out.background = leadDark ? side.first : side.last
            rest = rest.filter { $0 != out.background }
        }

        let ground = T.build(base, out.background != nil ? ThemePalette(background: out.background) : nil).tokens["bg"] ?? "#000000"
        if let far = rest.enumerated().sorted(by: { T.contrast($0.element, ground) != T.contrast($1.element, ground) ? T.contrast($0.element, ground) > T.contrast($1.element, ground) : $0.offset < $1.offset }).first?.element,
           T.contrast(far, ground) >= 3 {
            out.text = far
            rest = rest.filter { $0 != far }
        }

        if let bg = out.background {
            let candidates = rest
                .filter { isDark(bg) ? isDark($0) : isLight($0) }
                .map { (c: $0, d: colorDistance($0, bg)) }
                .filter { $0.d >= 0.025 && $0.d <= 0.16 }
                .filter { sameFamily($0.c, bg) }
            let near = candidates.enumerated().sorted { $0.element.d != $1.element.d ? $0.element.d < $1.element.d : $0.offset < $1.offset }.first?.element
            if let n = near { out.surface = n.c }
        }
        return out
    }

    /// Cards in another hue than the page fight it. Grays go with anything.
    static func sameFamily(_ c: String, _ bg: String) -> Bool {
        if chroma(c) < 0.03 || chroma(bg) < 0.03 { return true }
        let diff: Double = hue(c) - hue(bg) + 540
        let wrapped: Double = diff.truncatingRemainder(dividingBy: 360)
        return abs(wrapped - 180) < 35
    }

    public static func rolesToPalette(_ roles: RoleChoice) -> ThemePalette {
        var p = ThemePalette()
        if let v = roles.background { p.background = v }
        if let v = roles.surface { p.surface = v }
        if let v = roles.text { p.text = v }
        if let v = roles.accent { p.accent = v }
        return p
    }

    public static func paletteToRoles(_ p: ThemePalette?) -> RoleChoice {
        return RoleChoice(background: p?.background, surface: p?.surface, text: p?.text, accent: p?.accent)
    }

    /// Past this the picked color and the used color no longer look the same.
    public static let noticeableShift = 0.04

    /// For each role that was given a color, what the theme actually used and how far it moved.
    public static func roleShifts(_ roles: RoleChoice, _ theme: BuiltTheme) -> [RoleShift] {
        var out: [RoleShift] = []
        for role in ThemeRole.allCases {
            guard let asked = T.normalizeHex(roles[role]) else { continue }
            guard let used = theme.tokens[role.token] else { continue }
            let distance = colorDistance(asked, used)
            let lighter = hexToLab(used).l > hexToLab(asked).l
            let strong = theme.base == .contrast ? " High contrast asks for more." : ""
            let word = lighter ? "Lightened" : "Darkened"
            let why: String
            if role == .background || role == .surface {
                why = "\(word) so text has room to read on it.\(strong)"
            } else {
                why = "\(word) to stay readable on the background.\(strong)"
            }
            out.append(RoleShift(role: role, asked: asked, used: used, distance: distance, noticeable: distance > noticeableShift, why: why))
        }
        return out
    }

    // MARK: boards

    public static func kindLabel(_ k: BoardKind) -> String {
        switch k {
        case .body: return "Body"
        case .brand: return "Brand"
        case .life: return "Life"
        }
    }

    public static func kindHint(_ k: BoardKind) -> String {
        switch k {
        case .body: return "The physique you are training toward."
        case .brand: return "The direction of the work and the label."
        case .life: return "The place, the rooms, the days."
        }
    }

    public static func cleanBoardName(_ name: String, _ kind: BoardKind) -> String {
        let parts = name.split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" || $0 == "\r" })
        let joined = parts.joined(separator: " ")
        let n = String(joined.prefix(40)).trimmingCharacters(in: .whitespaces)
        return n.isEmpty ? kindLabel(kind) + " board" : n
    }

    static let schemeRx = try! NSRegularExpression(pattern: "^https?://", options: [.caseInsensitive])
    static let bareRx = try! NSRegularExpression(pattern: "^[a-z0-9-]+(\\.[a-z0-9-]+)+([/?#].*)?$", options: [.caseInsensitive])

    static func fullMatch(_ re: NSRegularExpression, _ s: String) -> Bool {
        return re.firstMatch(in: s, options: [], range: NSRange(location: 0, length: (s as NSString).length)) != nil
    }

    /// A typed or pasted link as a full URL, or nil when it is not one.
    public static func cleanLink(_ input: String) -> String? {
        let raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return nil }
        if raw.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) }) { return nil }
        let withScheme: String
        if fullMatch(schemeRx, raw) {
            withScheme = raw
        } else if fullMatch(bareRx, raw) {
            withScheme = "https://" + raw
        } else {
            return nil
        }
        guard var comps = URLComponents(string: withScheme), let scheme = comps.scheme?.lowercased(), scheme == "http" || scheme == "https", let host = comps.host, !host.isEmpty else { return nil }
        if comps.path.isEmpty { comps.path = "/" }
        return comps.string
    }

    /// "ssense.com" from a link, for showing where a reference points.
    public static func linkHost(_ url: String?) -> String? {
        guard let url = url, let host = URL(string: url)?.host, !host.isEmpty else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    /// The ids in a new order after moving one of them to `to` (an index in the result).
    public static func moveId(_ ids: [String], _ id: String, to: Int) -> [String] {
        guard ids.contains(id) else { return ids }
        var out = ids.filter { $0 != id }
        out.insert(id, at: Swift.min(out.count, Swift.max(0, to)))
        return out
    }

    /// The sort_order changes that put rows in the order of `ids`. Only rows whose number changes.
    public static func orderPatches(_ ids: [String], current: [(id: String, sortOrder: Int)]) -> [(id: String, sortOrder: Int)] {
        var now: [String: Int] = [:]
        for r in current { now[r.id] = r.sortOrder }
        var out: [(id: String, sortOrder: Int)] = []
        for (i, id) in ids.enumerated() {
            if let n = now[id], n != i { out.append((id, i)) }
        }
        return out
    }

    /// The image that stands for a board: its chosen cover, else its first image.
    public static func coverOf(_ coverId: String?, _ items: [BoardItem]) -> BoardItem? {
        let images = items.enumerated().filter { $0.element.kind == .image }
            .sorted { $0.element.sortOrder != $1.element.sortOrder ? $0.element.sortOrder < $1.element.sortOrder : $0.offset < $1.offset }
            .map { $0.element }
        if let cid = coverId, let hit = images.first(where: { $0.id == cid }) { return hit }
        return images.first
    }

    // MARK: the collage

    static let minAspect = 0.5
    static let maxAspect = 2.4
    /// An image at least this wide for its height can run full width.
    static let wide = 1.45
    /// How much taller than its own shape a tile may be made to close a gap.
    static let maxStretch = 0.3
    /// How much shorter.
    static let maxShrink = 0.22
    public static let notePad = 14.0

    public static func clampAspect(_ aspect: Double?) -> Double {
        guard let a = aspect, a.isFinite, a > 0 else { return 0.8 }
        return Swift.min(maxAspect, Swift.max(minAspect, a))
    }

    /// How a note is set in a tile of a given width: a short one large like a pull quote, a long one small.
    /// The tile and the layout both use this.
    public static func noteMetrics(chars: Int, width w: Double, link: Bool = false) -> NoteMetrics {
        let fontSize: Double = chars <= 28 ? 22 : (chars <= 90 ? 17 : 14)
        let lineHeight = MealsCore.jsRound(fontSize * (fontSize >= 20 ? 1.14 : 1.3))
        let perLine = Swift.max(4, ((w - notePad * 2) / (fontSize * 0.5)).rounded(.down))
        // Words do not fill every line, so allow a little more than the plain division.
        let lines = Int(Swift.min(10, Swift.max(1, (Double(chars) * 1.18 / perLine).rounded(.up))))
        let text: Double = chars > 0 ? Double(lines) * lineHeight : 0
        let linkExtra: Double = link ? (chars > 0 ? 30 : 20) : 0
        return NoteMetrics(fontSize: fontSize, lineHeight: lineHeight, lines: lines, height: notePad * 2 + text + linkExtra)
    }

    static func tileHeight(_ t: TileInput, _ w: Double, _ span: Bool) -> Double {
        switch t.kind {
        case .image:
            // A full width piece is capped so one tall photo cannot take the whole screen.
            let a = clampAspect(t.aspect)
            return MealsCore.jsRound(w / (span ? Swift.max(a, 1) : a))
        case .color:
            return MealsCore.jsRound(Swift.max(72, w * 0.62))
        case .note:
            return Swift.max(64, noteMetrics(chars: t.chars, width: w, link: t.link).height)
        }
    }

    /// Lay a board out as a collage.
    ///
    /// Two columns of unequal width. Each tile goes to the shorter column at its own aspect ratio. The first
    /// image, and any image wide enough, runs the full width, and after each of those the wide column changes
    /// side, so the board reads as a layout and not as a grid. Before a full width piece the shorter column's
    /// last tile is grown a little to meet the other, so no hole is left. When the hole is too big for that,
    /// the piece just takes a column.
    public static func layoutBoard(_ items: [TileInput], width rawWidth: Double, gap: Double = 6, split: Double = 0.58, hero: Bool = true) -> BoardLayout {
        let width = Swift.max(120, rawWidth.rounded(.down))
        let wideW = MealsCore.jsRound((width - gap) * split)
        let narrowW = width - gap - wideW

        var tiles: [TileRect] = []
        var wideLeft = true
        var top = 0.0
        // Running bottom of each column in this section, and the index of the last tile placed in it.
        var cols: [Double] = [top, top]
        var last: [Int?] = [nil, nil]
        var firstImage = true

        func colX(_ c: Int) -> Double { return c == 0 ? 0 : (wideLeft ? wideW : narrowW) + gap }
        func colW(_ c: Int) -> Double { return (c == 0) == wideLeft ? wideW : narrowW }

        var kinds: [String: TileInput.Kind] = [:]
        for i in items { kinds[i.id] = i.kind }

        /// How far a tile may grow or shrink. A photo is cropped by this, so it gets less room than a swatch or a note.
        func give(_ index: Int?, _ grow: Bool) -> Double {
            guard let index = index else { return 0 }
            let tile = tiles[index]
            let kind = kinds[tile.id]
            if kind == .image { return (tile.h * (grow ? maxStretch : maxShrink)).rounded(.down) }
            // A swatch is the same at any height. A note can grow but never shrink, its words need the room.
            if grow { return tile.h }
            return kind == .color ? (tile.h * 0.3).rounded(.down) : 0
        }

        /// Bring the two columns to the same bottom by growing the short one's last tile and trimming the tall
        /// one's. False when they are too far apart.
        func closeGap() -> Bool {
            let diff = cols[0] - cols[1]
            if diff == 0 { return true }
            let short = diff > 0 ? 1 : 0
            let tall = 1 - short
            let need = abs(diff)
            let grow = give(last[short], true)
            let shrink = give(last[tall], false)
            if need > grow + shrink { return false }
            let up = Swift.min(grow, MealsCore.jsRound(need * grow / (grow + shrink)))
            let down = need - up
            if let s = last[short], up > 0 {
                tiles[s].h += up
                tiles[s].stretched = true
                cols[short] += up
            }
            if let t = last[tall], down > 0 {
                tiles[t].h -= down
                tiles[t].stretched = true
                cols[tall] -= down
            }
            return cols[0] == cols[1]
        }

        for item in items {
            let isImage = item.kind == .image
            let wantsSpan = isImage && ((hero && firstImage) || clampAspect(item.aspect) >= wide)
            if isImage { firstImage = false }
            let empty = cols[0] == top && cols[1] == top

            if wantsSpan && (empty || closeGap()) {
                let y = Swift.max(cols[0], cols[1])
                let rect = TileRect(id: item.id, x: 0, y: y, w: width, h: tileHeight(item, width, true), span: true, stretched: false)
                tiles.append(rect)
                top = y + rect.h + gap
                cols = [top, top]
                last = [nil, nil]
                wideLeft = !wideLeft
                continue
            }

            let c = cols[1] < cols[0] ? 1 : 0
            let w = colW(c)
            let rect = TileRect(id: item.id, x: colX(c), y: cols[c], w: w, h: tileHeight(item, w, false), span: false, stretched: false)
            tiles.append(rect)
            cols[c] = rect.y + rect.h + gap
            last[c] = tiles.count - 1
        }

        let bottom = Swift.max(cols[0], cols[1], top)
        return BoardLayout(tiles: tiles, height: Swift.max(0, bottom - gap))
    }

    /// The tile under a point, or nil. For drag and drop.
    public static func tileAt(_ layout: BoardLayout, x: Double, y: Double) -> TileRect? {
        for t in layout.tiles where x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h { return t }
        return nil
    }
}
