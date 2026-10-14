import Foundation

// Where prices come from. Everything that needs a price asks a PriceSource,
// so a live integration can replace the estimates by providing the same shape.
// Port of src/lib/logic/mealsPricing.ts.
//
// Until then every number is an ESTIMATE: the food table's typical pack price
// scaled by how each chain usually prices each part of the store. A price the
// user typed from a receipt replaces the estimate for that item at that store.

public enum PriceQuoteSource: String, Equatable {
    case estimate
    case receipt
    case live
}

public struct PriceQuote: Equatable {
    /// Dollars for one pack.
    public var price: Double
    public var source: PriceQuoteSource

    public init(price: Double, source: PriceQuoteSource) {
        self.price = price
        self.source = source
    }
}

public struct PriceSource {
    /// Shown beside totals: "Estimated prices".
    public var label: String
    /// False only when every quote is a real price.
    public var estimated: Bool
    public var quote: (MealFood, String) -> PriceQuote

    public init(label: String, estimated: Bool, quote: @escaping (MealFood, String) -> PriceQuote) {
        self.label = label
        self.estimated = estimated
        self.quote = quote
    }
}

/// Pack price lookup for one store, the shape the planner and the list take.
public typealias PackPrices = (MealFood) -> Double

/// Receipt prices: dollars per pack by food key, then by store.
public typealias PriceCorrections = [String: [String: Double]]

public enum MealsPricing {
    public static let stores: [String] = ["Aldi", "Walmart", "Food Lion", "Harris Teeter", "Publix"]
    public static let defaultStore = "Aldi"

    public static func isStore(_ s: String?) -> Bool {
        guard let s = s else { return false }
        return stores.contains(s)
    }

    /// Rough price level of each chain by part of the store, where 1 is the food table's price.
    /// These are judgment calls, not measured data.
    private static let level: [String: (all: Double, parts: [MealSection: Double])] = [
        "Aldi": (0.84, [.meat: 0.9, .dairy: 0.8, .produce: 0.82]),
        "Walmart": (0.9, [.meat: 0.94, .produce: 0.92]),
        "Food Lion": (1.0, [:]),
        "Harris Teeter": (1.17, [.meat: 1.2, .produce: 1.15]),
        "Publix": (1.14, [.meat: 1.18, .produce: 1.12]),
    ]

    public static func storeLevel(_ store: String, _ section: MealSection) -> Double {
        guard let l = level[store] else { return 1 }
        return l.parts[section] ?? l.all
    }

    public static let estimateSource = PriceSource(label: "Estimated prices", estimated: true) { food, store in
        return PriceQuote(price: MealsCore.round(food.price * MealsPricing.storeLevel(store, food.section), 2), source: .estimate)
    }

    /// A source that prefers the user's receipt prices and falls back to `base`.
    public static func withCorrections(_ base: PriceSource, _ corrections: PriceCorrections) -> PriceSource {
        return PriceSource(label: base.label, estimated: base.estimated) { food, store in
            if let own = corrections[MealsCore.foodKey(food.name)]?[store], own.isFinite, own >= 0 {
                return PriceQuote(price: MealsCore.round(own, 2), source: .receipt)
            }
            return base.quote(food, store)
        }
    }

    public static func pricesAt(_ source: PriceSource, _ store: String) -> PackPrices {
        return { food in source.quote(food, store).price }
    }

    public static let basePrices: PackPrices = { food in food.price }

    /// Receipt rows folded into the corrections shape.
    public static func corrections(from rows: [ReceiptPrice]) -> PriceCorrections {
        var out: PriceCorrections = [:]
        for r in rows {
            out[MealsCore.foodKey(r.name), default: [:]][r.store] = r.price
        }
        return out
    }
}
