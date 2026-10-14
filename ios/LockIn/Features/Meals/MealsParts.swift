import SwiftUI
import LockInKit

/// The line that goes wherever a price estimate is shown.
struct MealsEstimateNote: View {
    @Environment(\.liTheme) private var theme
    var store: String? = nil
    var receipts: Int = 0

    var body: some View {
        let base = store.map { "Estimated prices, not \($0)'s shelf prices." } ?? "Estimated prices, not any store's shelf prices."
        Text(base + (receipts > 0 ? " \(receipts) from your receipts." : ""))
            .liType(.caption)
            .foregroundColor(theme.ink2)
    }
}

/// Calories and the three macros as one row of numbers.
struct MealsMacroRow: View {
    @Environment(\.liTheme) private var theme
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            cell("kcal", MealsCore.fmt(calories))
            cell("protein", MealsCore.fmt(protein) + "g")
            cell("carbs", MealsCore.fmt(carbs) + "g")
            cell("fat", MealsCore.fmt(fat) + "g")
        }
    }

    private func cell(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value).liType(.stat).foregroundColor(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
            Text(key).liType(.label).foregroundColor(theme.ink2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MealsIngredientList: View {
    @Environment(\.liTheme) private var theme
    let rows: [(name: String, amount: String)]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<rows.count, id: \.self) { i in
                if i > 0 { LIHairline() }
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(rows[i].name).liType(.body).foregroundColor(theme.ink)
                    Spacer(minLength: 8)
                    Text(rows[i].amount).liType(.sub).foregroundColor(theme.ink2)
                }
                .padding(.vertical, 11)
            }
        }
    }
}

struct MealsStepList: View {
    @Environment(\.liTheme) private var theme
    let steps: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(0..<steps.count, id: \.self) { i in
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text("\(i + 1)").liType(.sub).foregroundColor(theme.accent).frame(width: 16, alignment: .leading)
                    Text(steps[i]).liType(.body).foregroundColor(theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// A short word under a number, in the quiet label style, with a number above.
struct MealsTrackStat: View {
    @Environment(\.liTheme) private var theme
    let label: String
    let value: String
    var estimated: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).liType(.label).foregroundColor(theme.ink2).lineLimit(1)
            Text(value).liType(.stat).foregroundColor(theme.ink).lineLimit(1).minimumScaleFactor(0.7)
            if estimated {
                Text("est.").liType(.label).foregroundColor(theme.ink3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A list of words the user can add to and remove from, with one tap suggestions.
struct MealsTermChips: View {
    @Environment(\.liTheme) private var theme
    let label: String
    @Binding var terms: [String]
    let suggestions: [String]
    let placeholder: String

    @State private var text = ""

    private func has(_ t: String) -> Bool {
        return terms.contains { $0.lowercased() == t.lowercased() }
    }

    private func add(_ raw: String) {
        var added: [String] = []
        for piece in raw.split(separator: ",") {
            let t = piece.trimmingCharacters(in: .whitespaces).lowercased()
            if !t.isEmpty && t.count <= 30 && !has(t) && !added.contains(t) { added.append(t) }
        }
        if !added.isEmpty {
            LIHaptics.tap()
            terms.append(contentsOf: added)
        }
        text = ""
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(label).liType(.sub).foregroundColor(theme.ink2)
            if !terms.isEmpty {
                LXFlow(spacing: 8) {
                    ForEach(terms, id: \.self) { t in
                        Button(action: {
                            LIHaptics.tap()
                            terms.removeAll { $0 == t }
                        }) {
                            HStack(spacing: 6) {
                                Text(t).liType(.sub)
                                Image(systemName: "xmark").font(.system(size: 11, weight: .medium))
                            }
                            .foregroundColor(theme.bg)
                            .padding(.horizontal, 15)
                            .frame(minHeight: 44)
                            .background(Capsule().fill(theme.ink))
                        }
                        .buttonStyle(LIPressStyle())
                        .accessibilityLabel("Remove \(t)")
                    }
                }
            }
            LXField(label: nil, text: $text, placeholder: placeholder, capitalization: .never, onCommit: { add(text) })
            let open = suggestions.filter { !has($0) }.prefix(8)
            if !open.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(open), id: \.self) { s in
                            Button(action: { add(s) }) {
                                HStack(spacing: 5) {
                                    Image(systemName: "plus").font(.system(size: 11, weight: .medium))
                                    Text(s).liType(.sub)
                                }
                                .foregroundColor(theme.ink)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 44)
                                .background(Capsule().fill(theme.tile))
                                .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
                            }
                            .buttonStyle(LIPressStyle())
                        }
                    }
                }
            }
        }
        .onChange(of: text) { _, new in
            if new.hasSuffix(",") { add(new) }
        }
    }
}

enum MealsIdeas {
    static let likes = ["chicken", "turkey", "beef", "eggs", "rice", "pasta", "tacos", "tofu", "oats", "yogurt"]
    static let dislikes = ["fish", "shellfish", "tofu", "pork", "beef", "eggs", "dairy", "cottage cheese", "peanut butter", "protein powder", "beans", "spicy"]
}

/// "Wed Oct 14" style helper used in a few places.
enum MealsDates {
    static let dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    static func dayName(_ date: DateStr) -> String {
        return dayNames[LIDate.weekdayOf(date)]
    }

    static func dayOfMonth(_ date: DateStr) -> Int {
        return Int(date.suffix(2)) ?? 0
    }
}
