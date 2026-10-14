import SwiftUI
import CoreText
import UIKit

private final class LIBundleToken {}

/// Schibsted Grotesk, regular and medium. Registered from the framework bundle so the app and every extension can use it.
/// Falls back to the system font when the files are missing.
public enum LIFont {
    public static let regularName = "SchibstedGrotesk-Regular"
    public static let mediumName = "SchibstedGrotesk-Medium"

    private static var registered = false

    public static func register() {
        if registered { return }
        registered = true
        let bundle = Bundle(for: LIBundleToken.self)
        for file in ["SchibstedGrotesk-Regular", "SchibstedGrotesk-Medium"] {
            if let url = bundle.url(forResource: file, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }

    /// True when the face is installed.
    public static var isAvailable: Bool {
        register()
        return UIFont(name: mediumName, size: 12) != nil
    }

    public static func regular(_ size: CGFloat) -> Font {
        register()
        return Font.custom(regularName, size: size)
    }

    public static func medium(_ size: CGFloat) -> Font {
        register()
        return Font.custom(mediumName, size: size)
    }
}

/// The type scale from docs/BUILD.md. Medium with tight tracking for headlines and numbers, regular for body.
public enum LIType {
    case hero, display, greeting, num, title, numSm, h1, stat, h2, value, body, sub, caption, label

    var size: CGFloat {
        switch self {
        case .hero: return 84
        case .display: return 64
        case .greeting: return 38
        case .num: return 40
        case .title: return 28
        case .numSm: return 28
        case .h1: return 26
        case .stat: return 22
        case .h2: return 20
        case .value: return 20
        case .body: return 16
        case .sub: return 13
        case .caption: return 12
        case .label: return 11
        }
    }

    var isMedium: Bool {
        switch self {
        case .body, .sub, .caption: return false
        default: return true
        }
    }

    public var font: Font {
        return isMedium ? LIFont.medium(size) : LIFont.regular(size)
    }

    var tracking: CGFloat {
        switch self {
        case .hero, .display: return -size * 0.04
        case .greeting, .num, .title, .numSm, .h1: return -size * 0.025
        case .label: return 1.1
        default: return 0
        }
    }
}

struct LITypeModifier: ViewModifier {
    let style: LIType

    func body(content: Content) -> some View {
        if style == .label {
            content.font(style.font).tracking(style.tracking).textCase(.uppercase)
        } else {
            content.font(style.font).tracking(style.tracking)
        }
    }
}

extension View {
    /// Apply a step of the type scale.
    public func liType(_ style: LIType) -> some View {
        return modifier(LITypeModifier(style: style))
    }
}
