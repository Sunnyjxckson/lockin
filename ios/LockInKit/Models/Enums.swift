// Generated from src/lib/types.ts by ios tooling. Edit the generator spec, not this file by hand.
import Foundation

public enum ChallengeStatus: String, Codable, Equatable, CaseIterable {
    case active
    case ended
    case succeeded
    case abandoned
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = ChallengeStatus(rawValue: s) ?? .active
    }
}

public enum ItemType: String, Codable, Equatable, CaseIterable {
    case yesno
    case number
    case text
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = ItemType(rawValue: s) ?? .yesno
    }
}

public enum Cadence: String, Codable, Equatable, CaseIterable {
    case daily
    case weekly
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = Cadence(rawValue: s) ?? .daily
    }
}

public enum ItemCategory: String, Codable, Equatable, CaseIterable {
    case habit
    case vice
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = ItemCategory(rawValue: s) ?? .habit
    }
}

public enum ViceMode: String, Codable, Equatable, CaseIterable {
    case quit
    case cap
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = ViceMode(rawValue: s) ?? .quit
    }
}

public enum SpendPeriod: String, Codable, Equatable, CaseIterable {
    case day
    case week
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = SpendPeriod(rawValue: s) ?? .day
    }
}

public enum Track: String, Codable, Equatable, CaseIterable {
    case body
    case money
    case mind
    case clean
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = Track(rawValue: s) ?? .body
    }
}

public enum BlockKind: String, Codable, Equatable, CaseIterable {
    case wake
    case workout
    case home
    case classTime = "class"
    case delivery
    case basketball
    case study
    case bed
    case free
    case errand
    case other
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = BlockKind(rawValue: s) ?? .wake
    }
}

public enum BlockSource: String, Codable, Equatable, CaseIterable {
    case template
    case manual
    case calendar
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = BlockSource(rawValue: s) ?? .template
    }
}

public enum WorkoutKind: String, Codable, Equatable, CaseIterable {
    case lift
    case cardio
    case sport
    case rest
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = WorkoutKind(rawValue: s) ?? .lift
    }
}

public enum WorkoutSlot: String, Codable, Equatable, CaseIterable {
    case main
    case core
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = WorkoutSlot(rawValue: s) ?? .main
    }
}

public enum ReminderKind: String, Codable, Equatable, CaseIterable {
    case wake
    case workout
    case delivery
    case checkin
    case earningsNudge = "earnings_nudge"
    case custom
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = ReminderKind(rawValue: s) ?? .wake
    }
}

public enum CoachNoteKind: String, Codable, Equatable, CaseIterable {
    case morning
    case weekly
    case flag
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = CoachNoteKind(rawValue: s) ?? .morning
    }
}

public enum NoteSource: String, Codable, Equatable, CaseIterable {
    case ai
    case fallback
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = NoteSource(rawValue: s) ?? .ai
    }
}

public enum CoachVoice: String, Codable, Equatable, CaseIterable {
    case stoic
    case sergeant
    case brother
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = CoachVoice(rawValue: s) ?? .stoic
    }
}

public enum CoachTrigger: String, Codable, Equatable, CaseIterable {
    case chat
    case postWorkout = "post_workout"
    case slip
    case missedItem = "missed_item"
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = CoachTrigger(rawValue: s) ?? .chat
    }
}

public enum CoachSender: String, Codable, Equatable, CaseIterable {
    case me
    case coach
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = CoachSender(rawValue: s) ?? .me
    }
}

public enum MotivationKind: String, Codable, Equatable, CaseIterable {
    case quote
    case clip
    case why
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = MotivationKind(rawValue: s) ?? .quote
    }
}

public enum BoardKind: String, Codable, Equatable, CaseIterable {
    case body
    case brand
    case life
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = BoardKind(rawValue: s) ?? .body
    }
}

public enum BoardItemKind: String, Codable, Equatable, CaseIterable {
    case image
    case color
    case note
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = BoardItemKind(rawValue: s) ?? .image
    }
}

public enum BoardItemSource: String, Codable, Equatable, CaseIterable {
    case camera
    case web
    case screenshot
    case upload
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = BoardItemSource(rawValue: s) ?? .camera
    }
}

public enum ThemeBase: String, Codable, Equatable, CaseIterable {
    case dark
    case contrast
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = ThemeBase(rawValue: s) ?? .dark
    }
}

public enum MealSlot: String, Codable, Equatable, CaseIterable {
    case breakfast
    case lunch
    case dinner
    case snack
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = MealSlot(rawValue: s) ?? .breakfast
    }
}

public enum RecipeSource: String, Codable, Equatable, CaseIterable {
    case seed
    case user
    case ai
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = RecipeSource(rawValue: s) ?? .seed
    }
}

public enum SessionSource: String, Codable, Equatable, CaseIterable {
    case timer
    case manual
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = SessionSource(rawValue: s) ?? .timer
    }
}

public enum WeightUnit: String, Codable, Equatable, CaseIterable {
    case lb
    case kg
    public init(from decoder: Decoder) throws {
        let s: String = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        self = WeightUnit(rawValue: s) ?? .lb
    }
}
