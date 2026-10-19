// Generated from src/lib/types.ts. Every row type decodes tolerantly: a missing or odd column falls back to a default.
import Foundation

public struct ChallengeRule: Codable, Equatable {
    public var itemId: String = ""
    public var target: Target? = nil
    public init(itemId: String = "", target: Target? = nil) {
        self.itemId = itemId
        self.target = target
    }
    public enum CodingKeys: String, CodingKey {
        case itemId = "item_id", target
    }
}

extension ChallengeRule {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        itemId = c.or(.itemId, "")
        target = c.opt(.target)
    }
}

public struct Exercise: Codable, Equatable {
    public var name: String = ""
    public var sets: Int = 0
    public var reps: String = ""
    /// Current working weight as plan text ("40s (try 45s)", "Light"). Missing on older rows.
    public var weight: String? = nil
    /// A short cue shown in muted text. Missing on older rows.
    public var note: String? = nil
    public init(name: String = "", sets: Int = 0, reps: String = "", weight: String? = nil, note: String? = nil) {
        self.name = name
        self.sets = sets
        self.reps = reps
        self.weight = weight
        self.note = note
    }
    public enum CodingKeys: String, CodingKey {
        case name, sets, reps, weight, note
    }
}

extension Exercise {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.or(.name, "")
        sets = c.or(.sets, 0)
        reps = c.flexString(.reps)
        let w = c.flexString(.weight)
        weight = w.isEmpty ? nil : w
        let n = c.flexString(.note)
        note = n.isEmpty ? nil : n
    }
}

public struct LibraryPosition: Codable, Equatable {
    public var scope: String = ""
    public var quoteId: String? = nil
    public var at: String = ""
    public var seed: Int? = nil
    public init(scope: String = "", quoteId: String? = nil, at: String = "", seed: Int? = nil) {
        self.scope = scope
        self.quoteId = quoteId
        self.at = at
        self.seed = seed
    }
    public enum CodingKeys: String, CodingKey {
        case scope, quoteId = "quote_id", at, seed
    }
}

extension LibraryPosition {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        scope = c.or(.scope, "")
        quoteId = c.opt(.quoteId)
        at = c.or(.at, "")
        seed = c.opt(.seed)
    }
}

public struct CoachCheckins: Codable, Equatable {
    public var postWorkout: Bool = true
    public var slip: Bool = true
    public var missedItem: Bool = true
    public init(postWorkout: Bool = true, slip: Bool = true, missedItem: Bool = true) {
        self.postWorkout = postWorkout
        self.slip = slip
        self.missedItem = missedItem
    }
    public enum CodingKeys: String, CodingKey {
        case postWorkout = "post_workout", slip, missedItem = "missed_item"
    }
}

extension CoachCheckins {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        postWorkout = c.or(.postWorkout, true)
        slip = c.or(.slip, true)
        missedItem = c.or(.missedItem, true)
    }
}

public struct ThemePalette: Codable, Equatable {
    public var background: String? = nil
    public var surface: String? = nil
    public var text: String? = nil
    public var muted: String? = nil
    public var accent: String? = nil
    public init(background: String? = nil, surface: String? = nil, text: String? = nil, muted: String? = nil, accent: String? = nil) {
        self.background = background
        self.surface = surface
        self.text = text
        self.muted = muted
        self.accent = accent
    }
    public enum CodingKeys: String, CodingKey {
        case background, surface, text, muted, accent
    }
}

extension ThemePalette {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        background = c.opt(.background)
        surface = c.opt(.surface)
        text = c.opt(.text)
        muted = c.opt(.muted)
        accent = c.opt(.accent)
    }
}

public struct Ingredient: Codable, Equatable {
    public var name: String = ""
    public var quantity: Double = 0
    public var unit: String = ""
    public var estCost: Double? = nil
    public var category: String? = nil
    public init(name: String = "", quantity: Double = 0, unit: String = "", estCost: Double? = nil, category: String? = nil) {
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.estCost = estCost
        self.category = category
    }
    public enum CodingKeys: String, CodingKey {
        case name, quantity, unit, estCost = "est_cost", category
    }
}

extension Ingredient {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = c.or(.name, "")
        quantity = c.or(.quantity, 0)
        unit = c.or(.unit, "")
        estCost = c.opt(.estCost)
        category = c.opt(.category)
    }
}

public struct PlannedMeal: Codable, Equatable {
    public var date: String = ""
    public var slot: MealSlot = .breakfast
    public var recipeId: String = ""
    public var servings: Double = 1
    public var logged: String? = nil
    public init(date: String = "", slot: MealSlot = .breakfast, recipeId: String = "", servings: Double = 1, logged: String? = nil) {
        self.date = date
        self.slot = slot
        self.recipeId = recipeId
        self.servings = servings
        self.logged = logged
    }
    public enum CodingKeys: String, CodingKey {
        case date, slot, recipeId = "recipe_id", servings, logged
    }
}

extension PlannedMeal {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = c.or(.date, "")
        slot = c.or(.slot, .breakfast)
        recipeId = c.or(.recipeId, "")
        servings = c.or(.servings, 1)
        logged = c.opt(.logged)
    }
}

public struct FocusSpan: Codable, Equatable {
    public var from: Double = 0
    public var to: Double? = nil
    public init(from: Double = 0, to: Double? = nil) {
        self.from = from
        self.to = to
    }
    public enum CodingKeys: String, CodingKey {
        case from, to
    }
}

extension FocusSpan {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        from = c.or(.from, 0)
        to = c.opt(.to)
    }
}

public struct FocusAway: Codable, Equatable {
    public var from: Double = 0
    public var to: Double? = nil
    public var counted: Bool = false
    public var reviewed: Bool = false
    public init(from: Double = 0, to: Double? = nil, counted: Bool = false, reviewed: Bool = false) {
        self.from = from
        self.to = to
        self.counted = counted
        self.reviewed = reviewed
    }
    public enum CodingKeys: String, CodingKey {
        case from, to, counted, reviewed
    }
}

extension FocusAway {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        from = c.or(.from, 0)
        to = c.opt(.to)
        counted = c.or(.counted, false)
        reviewed = c.or(.reviewed, false)
    }
}

public struct FocusLive: Codable, Equatable {
    public var startedAt: Double = 0
    public var plannedSeconds: Double? = nil
    public var pauses: [FocusSpan] = []
    public var aways: [FocusAway] = []
    public var rev: Double = 0
    public init(startedAt: Double = 0, plannedSeconds: Double? = nil, pauses: [FocusSpan] = [], aways: [FocusAway] = [], rev: Double = 0) {
        self.startedAt = startedAt
        self.plannedSeconds = plannedSeconds
        self.pauses = pauses
        self.aways = aways
        self.rev = rev
    }
    public enum CodingKeys: String, CodingKey {
        case startedAt = "started_at", plannedSeconds = "planned_seconds", pauses, aways, rev
    }
}

extension FocusLive {
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        startedAt = c.or(.startedAt, 0)
        plannedSeconds = c.opt(.plannedSeconds)
        pauses = c.or(.pauses, [])
        aways = c.or(.aways, [])
        rev = c.or(.rev, 0)
    }
}
