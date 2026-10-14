import Foundation

// What a coach chat message is about, and the Library lines the coach may quote for it.
// Port of classifyMessage and careInPlay in src/lib/logic/coachChat.ts and of src/lib/logic/coachLibrary.ts.
// Injury, emergency and "more than a bad day" never get a quote.

/// A library line the coach may use in a reply.
public struct LibCandidate: Equatable {
    /// "lib:" and the quote id.
    public var key: String
    public var text: String
    public var by: String
    public var saved: Bool

    public func json() -> JSON {
        var o: JSONObject = ["key": .string(key), "text": .string(text), "by": .string(by)]
        if saved { o["saved"] = .bool(true) }
        return .object(o)
    }
}

public enum CoachTopic: String {
    case care, emergency, injury, pain, urge, slipped, hungry, tired, money, study, unmotivated, win, general
}

public enum CoachLibrary {
    public static let prefix = "lib:"
    public static let maxCandidates = 6

    static func re(_ pattern: String) -> NSRegularExpression {
        return try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    static func hits(_ r: NSRegularExpression, _ text: String) -> Bool {
        return r.firstMatch(in: text, options: [], range: NSRange(text.startIndex..., in: text)) != nil
    }

    static let care = re(#"\b(kill(ing)? myself|suicid\w*|end it all|end my life|want(ed)? to die|wanna die|don'?t want to (be here|live|be alive|wake up)|hurt(ing)? myself|harm(ing)? myself|self[- ]harm|cutting myself|no reason to live|better off (dead|without me))\b"#)
    static let emergency = re(#"\b(chest (pain|hurts|is tight|tightness)|can'?t breathe|trouble breathing|faint(ed|ing)?|pass(ed|ing) out|black(ed|ing) out|coughing (up )?blood)\b"#)
    static let joint = "(knee|elbow|shoulder|wrist|ankle|lower back|spine|neck|hip|achilles|groin|hamstring)s?"
    static let injury = re([
        #"\b(sharp|stabbing|shooting)\b"#,
        #"\b(pop|popp?ed|snapp?ed|tore|torn|tear|sprain(ed)?|pulled (a|my|something)|strained|swollen|swelling|numb(ness)?|tingl(e|ing)|limping|injur(y|ed))\b"#,
        #"\bcan'?t (move|walk|bend|lift|straighten|put weight)\b"#,
        #"\bone side\b"#,
        "\\b" + joint + "\\b.*\\b(pain|hurts?|hurting|aches?|aching)\\b",
        "\\b(pain|hurts?|hurting|aches?|aching)\\b.*\\b" + joint + "\\b",
    ].joined(separator: "|"))
    static let viceWord = #"(smok\w*|cig\w*|vap\w*|drink(ing)?(?! (more |some )?water)|drunk|beer|liquor|weed|blunt|get(ting)? high|nut|jerk\w*|masturbat\w*|porn|bet(s|ting)?|gambl\w*|scroll\w*|tiktok|junk food|fast food|energy drink)"#
    static let urge = re(#"\b(crav\w*|urge|tempt\w*)\b|\b(want|wanna|need|about to|going to|gonna|feel like)\b.*\b"# + viceWord + #"\b"#)
    static let slipped = re(#"\b(i (just )?(smoked|drank|vaped|relapsed|slipped|caved|gave in|broke|messed up|screwed up|fucked up|failed|skipped|missed|blew it|overslept)|relapse)\b"#)
    static let pain = re(#"\b(sore|soreness|hurts?|hurting|pain|aches?|aching|achy|dead|burn(s|ing)?|cramp\w*|stiff|killing me|destroyed|wrecked)\b"#)
    static let hungry = re(#"\b(hungry|starving|hunger|appetite)\b"#)
    static let tired = re(#"\b(tired|exhausted|sleepy|no sleep|didn'?t sleep|drained|wiped|burn(ed|t) out|no energy|fatigue\w*)\b"#)
    static let money = re(#"\b(deliver\w*|doordash|dash(ing)?|uber|instacart|money|broke|floor|orders?|slow night|earn\w*)\b|\$\d"#)
    static let study = re(#"\b(study\w*|homework|class|exam|assignment|paper|quiz|lecture)\b"#)
    static let unmotivated = re(#"\b(don'?t (feel like|want to|wanna)|not feeling it|can'?t be bothered|lazy|unmotivated|no motivation|motivat\w*|skip\w*|give up|giving up|quit\w*|what'?s the point|pointless|bored|procrastinat\w*|tomorrow instead)\b"#)
    static let win = re(#"\b(did it|got it done|finished|crushed|killed it|hit (it|my|a)|new pr|personal record|locked in|proud)\b"#)

    /// What a message is about. Safety comes first, in this order: care, emergency, injury.
    public static func classify(_ text: String) -> CoachTopic {
        if hits(care, text) { return .care }
        if hits(emergency, text) { return .emergency }
        if hits(injury, text) { return .injury }
        if hits(urge, text) { return .urge }
        if hits(slipped, text) { return .slipped }
        if hits(pain, text) { return .pain }
        if hits(hungry, text) { return .hungry }
        if hits(tired, text) { return .tired }
        if hits(unmotivated, text) { return .unmotivated }
        if hits(money, text) { return .money }
        if hits(study, text) { return .study }
        if hits(win, text) { return .win }
        return .general
    }

    /// True when anything they said in the conversation so far reads as more than a bad day.
    public static func careInPlay(_ turns: [(sender: String, body: String)]) -> Bool {
        return turns.contains { $0.sender == "me" && hits(care, $0.body) }
    }

    // MARK: moments

    static let words: [(String, NSRegularExpression)] = [
        ("angry", re(#"\b(angry|anger|mad|furious|pissed|rage|resent\w*|annoyed|irritated)\b"#)),
        ("alone", re(#"\b(alone|lonely|loneliness|nobody|no one|isolated|left out)\b"#)),
        ("afraid", re(#"\b(scared|afraid|fear\w*|anxious|anxiety|nervous|worried|worry|dread\w*|panic\w*)\b"#)),
        ("overwhelmed", re(#"\b(overwhelm\w*|too much|stressed|swamped|behind on|buried|can'?t keep up)\b"#)),
        ("doubting", re(#"\b(doubt\w*|not good enough|can'?t do (this|it)|what'?s the point|am i (even|really)|imposter|impostor|give up|giving up)\b"#)),
        ("broke", re(#"\b(broke|no money|can'?t afford|bills?|debt|rent)\b"#)),
        ("tempted", re(#"\b(tempt\w*|crav\w*|urge|want to (smoke|drink)|about to)\b"#)),
        ("tired", re(#"\b(tired|exhausted|drained|wiped|burn(ed|t) out|no energy)\b"#)),
    ]

    static let byTopic: [CoachTopic: [String]] = [
        .pain: ["tired", "doubting"],
        .urge: ["tempted"],
        .slipped: ["doubting"],
        .hungry: ["tempted"],
        .tired: ["tired", "overwhelmed"],
        .unmotivated: ["doubting", "tired"],
        .money: ["broke", "overwhelmed"],
        .study: ["overwhelmed", "tired"],
        .general: ["doubting", "overwhelmed"],
    ]

    /// The Library moments a message is about, most specific first. Nothing for a win or the safety topics.
    public static func momentsFor(_ topic: CoachTopic, _ message: String) -> [String] {
        if topic == .care || topic == .emergency || topic == .injury || topic == .win { return [] }
        var out: [String] = []
        for (m, r) in words where hits(r, message) { if !out.contains(m) { out.append(m) } }
        for m in byTopic[topic] ?? [] { if !out.contains(m) { out.append(m) } }
        return out
    }

    // MARK: picking

    /// A few lines that fit the moment from the short set: saved first, then unread, then the rest.
    /// Lines used this week are left out, and the laws are not advice.
    public static func pickCandidates(pool: ShortPool, topic: CoachTopic, message: String, saved: Set<String>, read: Set<String>, used: [String], date: DateStr, count: Int = maxCandidates) -> [LibCandidate] {
        let moments = momentsFor(topic, message)
        if moments.isEmpty { return [] }
        let usedSet = Set(used)
        let fits = pool.quotes.filter { q in
            q.w != "laws" && !usedSet.contains(prefix + q.id) && q.m.contains(where: { moments.contains($0) })
        }
        let rand = SeededRandom(seed: LibraryQueue.daySeed(date, extra: message.utf16.count * 17))
        struct Keyed {
            let q: ShortQuote
            let r: Int
            let tie: Double
            let first: Int
            let order: Int
        }
        var keyed: [Keyed] = []
        for (i, q) in fits.enumerated() {
            let r = saved.contains(q.id) ? 0 : (read.contains(q.id) ? 2 : 1)
            let tie = rand.next()
            let first = q.m.firstIndex(where: { moments.contains($0) }) ?? 0
            keyed.append(Keyed(q: q, r: r, tie: tie, first: first, order: i))
        }
        keyed.sort { a, b in
            if a.r != b.r { return a.r < b.r }
            let ma = moments.firstIndex(of: a.q.m[a.first]) ?? 0
            let mb = moments.firstIndex(of: b.q.m[b.first]) ?? 0
            if ma != mb { return ma < mb }
            if a.tie != b.tie { return a.tie < b.tie }
            return a.order < b.order
        }
        return keyed.prefix(count).map { k in
            LibCandidate(key: prefix + k.q.id, text: k.q.t, by: pool.names[k.q.w] ?? k.q.w, saved: k.r == 0)
        }
    }
}
