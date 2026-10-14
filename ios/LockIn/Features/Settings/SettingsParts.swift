import SwiftUI
import LockInKit

/// Run a write, buzz, and say what went wrong when it does.
@MainActor
func lxRun(_ toast: Binding<String?>, ok: String? = nil, _ work: @escaping () async throws -> Void) {
    Task { @MainActor in
        do {
            try await work()
            LIHaptics.tap()
            if let ok = ok { toast.wrappedValue = ok }
        } catch {
            LIHaptics.error()
            toast.wrappedValue = SettingsModel.describe(error)
        }
    }
}

enum SettingsDays {
    /// Monday first, the way the week runs. Weekday 0 is Sunday.
    static let order = [1, 2, 3, 4, 5, 6, 0]
    static let short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    static let long = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
}

/// A page inside Settings: the big title, then its content.
struct SettingsPage<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    let content: Content

    init(_ title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        LIScreen {
            LIPageHeader(title, subtitle: subtitle)
            content
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Rows in one tile, with a hairline between them.
struct SettingsList<Item: Identifiable, Row: View>: View {
    @Environment(\.liTheme) private var theme
    let items: [Item]
    let row: (Item) -> Row

    init(_ items: [Item], @ViewBuilder row: @escaping (Item) -> Row) {
        self.items = items
        self.row = row
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                if i > 0 {
                    Rectangle().fill(theme.tileLine).frame(height: 1).padding(.leading, 20)
                }
                row(item)
            }
        }
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(theme.tile))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// A tile that holds anything, for toggles and fields.
struct SettingsTile<Content: View>: View {
    @Environment(\.liTheme) private var theme
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            content
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(theme.tile))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
    }
}

struct SettingsLabel: View {
    @Environment(\.liTheme) private var theme
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).liType(.label).foregroundColor(theme.ink2).padding(.top, 28).padding(.bottom, 10)
    }
}

/// A choice among a few named things, shown as chips.
struct SettingsChips<Value: Hashable>: View {
    @Environment(\.liTheme) private var theme
    let options: [(value: Value, title: String)]
    @Binding var selection: Value

    var body: some View {
        LXFlow(spacing: 8) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, o in
                let on = o.value == selection
                Button {
                    selection = o.value
                    LIHaptics.tap()
                } label: {
                    Text(o.title).liType(.sub)
                        .foregroundColor(on ? theme.accentInk : theme.ink)
                        .padding(.horizontal, 14)
                        .frame(height: 38)
                        .background(Capsule().fill(on ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.tile)))
                        .overlay(Capsule().strokeBorder(on ? Color.clear : theme.tileLine, lineWidth: 1))
                }
                .buttonStyle(LIPressStyle())
            }
        }
    }
}

extension BlockKind {
    var settingsLabel: String {
        switch self {
        case .wake: return "Wake"
        case .workout: return "Workout"
        case .home: return "Home"
        case .classTime: return "Class"
        case .delivery: return "Delivery"
        case .basketball: return "Basketball"
        case .study: return "Study"
        case .bed: return "Bed"
        case .free: return "Free"
        case .errand: return "Errand"
        case .other: return "Other"
        }
    }
}

enum SettingsText {
    static func target(_ t: Target, unit: String?) -> String {
        let u = (unit ?? "").trimmingCharacters(in: .whitespaces)
        let suffix = u.isEmpty ? "" : " " + u
        switch t {
        case .check: return "Yes or no"
        case .checkBy(let by): return "By " + LIDate.formatTime(by)
        case .min(let n): return "At least " + MealsCore.jsNum(n) + suffix
        case .max(let n): return "At most " + MealsCore.jsNum(n) + suffix
        case .range(let a, let b): return MealsCore.jsNum(a) + " to " + MealsCore.jsNum(b) + suffix
        case .text: return "A line of text"
        }
    }
}
