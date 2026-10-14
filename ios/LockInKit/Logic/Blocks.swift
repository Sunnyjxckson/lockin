import Foundation

/// A block as shown on screen, whichever table it came from.
public struct DayBlock: Equatable, Identifiable {
    /// schedule_block id, or "template:<template id>" when built from the template.
    public var id: String
    public var date: DateStr
    public var blockName: String
    public var start: TimeStr
    public var end: TimeStr
    public var duration: Int
    public var flexible: Bool
    public var kind: BlockKind
    public var note: String?
    public var templateId: String?
    public var source: BlockSource
    /// True when this is a real schedule_block row, false when derived.
    public var persisted: Bool
}

public struct NowNext {
    /// The block the clock is inside, if any.
    public var now: DayBlock?
    /// The next block to start after the current time.
    public var next: DayBlock?
    public var minutesLeft: Int?
    public var minutesUntilNext: Int?
}

/// Port of src/lib/blocks.ts: today's blocks from the template plus per-day overrides, and now and next.
public enum Blocks {
    static func byStart(_ a: DayBlock, _ b: DayBlock) -> Bool {
        let sa = LIDate.minutesOf(a.start)
        let sb = LIDate.minutesOf(b.start)
        if sa != sb { return sa < sb }
        let ea = LIDate.minutesOf(a.end)
        let eb = LIDate.minutesOf(b.end)
        if ea != eb { return ea < eb }
        return a.id < b.id
    }

    /// Build a day's blocks from template rows.
    public static func blocksFromTemplate(_ date: DateStr, _ template: [ScheduleTemplate]) -> [DayBlock] {
        let weekday = LIDate.weekdayOf(date)
        let blocks = template.filter { $0.weekday == weekday }.map { t in
            DayBlock(
                id: "template:\(t.id)",
                date: date,
                blockName: t.blockName,
                start: t.start,
                end: t.end,
                duration: LIDate.durationMinutes(t.start, t.end),
                flexible: t.flexible,
                kind: t.kind,
                note: t.note,
                templateId: t.id,
                source: .template,
                persisted: false
            )
        }
        return blocks.sorted(by: byStart)
    }

    /// Per-day rows as DayBlocks.
    public static func blocksFromRows(_ rows: [ScheduleBlock]) -> [DayBlock] {
        let blocks = rows.map { r in
            DayBlock(
                id: r.id,
                date: r.date,
                blockName: r.blockName,
                start: r.start,
                end: r.end,
                duration: r.duration,
                flexible: r.flexible,
                kind: r.kind,
                note: r.note,
                templateId: r.templateId,
                source: r.source,
                persisted: true
            )
        }
        return blocks.sorted(by: byStart)
    }

    /// Choose per-day rows when the day has any, else the template.
    public static func resolveBlocks(_ date: DateStr, rows: [ScheduleBlock], template: [ScheduleTemplate]) -> [DayBlock] {
        let own = rows.filter { $0.date == date }
        return own.isEmpty ? blocksFromTemplate(date, template) : blocksFromRows(own)
    }

    /// Current and next block for a clock time on the same day. When blocks overlap, the one that started most recently is "now".
    public static func nowAndNext(_ blocks: [DayBlock], time: TimeStr) -> NowNext {
        let t = LIDate.minutesOf(time)
        let sorted = blocks.sorted(by: byStart)
        var now: DayBlock? = nil
        for b in sorted {
            let s = LIDate.minutesOf(b.start)
            let e = s + b.duration
            if s <= t && t < e { now = b }
        }
        let next = sorted.first { LIDate.minutesOf($0.start) > t }
        return NowNext(
            now: now,
            next: next,
            minutesLeft: now.map { LIDate.minutesOf($0.start) + $0.duration - t },
            minutesUntilNext: next.map { LIDate.minutesOf($0.start) - t }
        )
    }
}
