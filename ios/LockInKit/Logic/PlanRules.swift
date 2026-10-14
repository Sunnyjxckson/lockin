import Foundation

/// Anything with a start time and a length in minutes.
public protocol TimedBlock {
    var start: TimeStr { get }
    var duration: Int { get }
}

extension DayBlock: TimedBlock {}

/// A bare start and length, for callers that have no block yet.
public struct PlainTimed: TimedBlock, Equatable {
    public var start: TimeStr
    public var duration: Int
    public init(start: TimeStr, duration: Int) {
        self.start = start
        self.duration = duration
    }
}

/// Minutes since midnight. `e` is exclusive.
public struct BlockSpan: Equatable {
    public var s: Int
    public var e: Int
    public init(s: Int, e: Int) {
        self.s = s
        self.e = e
    }
}

public struct BlockTimeRange: Equatable {
    public var start: TimeStr
    public var end: TimeStr
    public init(start: TimeStr, end: TimeStr) {
        self.start = start
        self.end = end
    }
}

public struct BlockOverlap {
    public var a: DayBlock
    public var b: DayBlock
    public var start: TimeStr
    public var end: TimeStr
    public var minutes: Int
    /// True when a block that cannot move is involved.
    public var fixed: Bool
}

public struct OpenSlot: Equatable {
    public var start: TimeStr
    public var end: TimeStr
    public var startMin: Int
    public var endMin: Int
}

public struct ShiftChange: Equatable {
    public var id: String
    public var name: String
    public var from: BlockTimeRange
    public var to: BlockTimeRange
    /// Minutes cut off to fit in front of a fixed block. 0 when only moved.
    public var cut: Int
}

public struct ShiftConflict: Equatable {
    /// The block that runs into the fixed one.
    public var id: String
    /// The fixed block that did not move.
    public var withId: String
    public var minutes: Int
}

public struct ShiftResult {
    public var blocks: [DayBlock]
    public var moved: [ShiftChange]
    public var conflicts: [ShiftConflict]
}

/// A typed edit. Nil leaves the field alone. `note` is a double optional: nil leaves it, .some(nil) clears it.
public struct BlockPatch {
    public var blockName: String? = nil
    public var start: TimeStr? = nil
    public var end: TimeStr? = nil
    public var flexible: Bool? = nil
    public var kind: BlockKind? = nil
    public var note: String?? = nil
    public init(blockName: String? = nil, start: TimeStr? = nil, end: TimeStr? = nil, flexible: Bool? = nil, kind: BlockKind? = nil, note: String?? = nil) {
        self.blockName = blockName
        self.start = start
        self.end = end
        self.flexible = flexible
        self.kind = kind
        self.note = note
    }
}

public struct DayWrite {
    public var insert: [JSONObject] = []
    public var update: [(id: String, patch: JSONObject)] = []
    public var remove: [String] = []
    public init() {}
    public var isEmpty: Bool { return insert.isEmpty && update.isEmpty && remove.isEmpty }
}

public struct BlockLane: Equatable {
    public var lane: Int
    public var lanes: Int
    public init(lane: Int, lanes: Int) {
        self.lane = lane
        self.lanes = lanes
    }
}

public enum FreeTimerPhase: String, Equatable {
    case before, live, over
}

public struct FreeTimerState: Equatable {
    public var phase: FreeTimerPhase
    /// Seconds left while live, 0 otherwise.
    public var remaining: Int
    /// Seconds past the end once over, 0 otherwise.
    public var overBy: Int
    /// 0 to 1 through the block.
    public var progress: Double
}

/// Rules for the Plan screen. Port of src/lib/logic/schedule.ts. Pure: no db, no clock reads.
///
/// A day is a list of blocks. Every function takes a list and returns a new one, so the screen can preview a
/// change (a drag, a shift) and only write it once the user lets go. Times inside are minutes since midnight.
/// A block never crosses midnight: the day ends at 1440, stored as "00:00" with the length in `duration`.
public enum PlanRules {
    public static let dayEnd = 1440
    /// Shortest block the editor allows.
    public static let minBlock = 5
    /// A shifted block is squeezed in front of a fixed one only if this much is left.
    public static let minCompressed = 15

    // MARK: spans and snapping

    public static func spanOf(_ b: TimedBlock) -> BlockSpan {
        let s = LIDate.minutesOf(b.start)
        return BlockSpan(s: s, e: min(dayEnd, s + max(0, b.duration)))
    }

    /// Put a block on new minutes. Clamped to the day, never shorter than minBlock.
    public static func withSpan(_ b: DayBlock, _ s: Int, _ e: Int) -> DayBlock {
        let start = max(0, min(dayEnd - minBlock, s))
        let end = max(start + minBlock, min(dayEnd, e))
        var out = b
        out.start = LIDate.timeFromMinutes(start)
        out.end = LIDate.timeFromMinutes(end)
        out.duration = end - start
        return out
    }

    /// Nearest multiple of `step`, halves round up.
    public static func snap(_ minutes: Int, _ step: Int = 5) -> Int {
        // floor(x + 0.5) matches Math.round, including for negative halves.
        let q = (Double(minutes) / Double(step) + 0.5).rounded(.down)
        return Int(q) * step
    }

    /// Next multiple of `step` at or after `minutes`.
    public static func snapUp(_ minutes: Int, _ step: Int = 5) -> Int {
        let q = Int((Double(minutes) / Double(step)).rounded(.up))
        return q * step
    }

    public static func snapTime(_ time: TimeStr, _ step: Int = 5) -> TimeStr {
        return LIDate.timeFromMinutes(min(dayEnd - step, snap(LIDate.minutesOf(time), step)))
    }

    static func order(_ blocks: [DayBlock]) -> [DayBlock] {
        return blocks.enumerated().sorted { l, r in
            let x = spanOf(l.element)
            let y = spanOf(r.element)
            if x.s != y.s { return x.s < y.s }
            if x.e != y.e { return x.e < y.e }
            if l.element.id != r.element.id { return l.element.id < r.element.id }
            return l.offset < r.offset
        }.map { $0.element }
    }

    public static func sortBlocks(_ blocks: [DayBlock]) -> [DayBlock] {
        return order(blocks)
    }

    // MARK: overlaps

    public static func overlapMinutes(_ a: TimedBlock, _ b: TimedBlock) -> Int {
        let x = spanOf(a)
        let y = spanOf(b)
        return max(0, min(x.e, y.e) - max(x.s, y.s))
    }

    /// Every pair of blocks that share at least a minute, earliest first.
    public static func findOverlaps(_ blocks: [DayBlock]) -> [BlockOverlap] {
        let sorted = order(blocks)
        var out: [BlockOverlap] = []
        for i in 0..<sorted.count {
            let x = spanOf(sorted[i])
            var j = i + 1
            while j < sorted.count {
                let y = spanOf(sorted[j])
                if y.s >= x.e { break }
                let s = max(x.s, y.s)
                let e = min(x.e, y.e)
                if e - s >= 1 {
                    out.append(BlockOverlap(
                        a: sorted[i],
                        b: sorted[j],
                        start: LIDate.timeFromMinutes(s),
                        end: LIDate.timeFromMinutes(e),
                        minutes: e - s,
                        fixed: !sorted[i].flexible || !sorted[j].flexible
                    ))
                }
                j += 1
            }
        }
        return out
    }

    /// Ids of blocks that overlap something.
    public static func overlappingIds(_ blocks: [DayBlock]) -> Set<String> {
        var ids = Set<String>()
        for o in findOverlaps(blocks) {
            ids.insert(o.a.id)
            ids.insert(o.b.id)
        }
        return ids
    }

    // MARK: next open slot

    /// The first gap of `duration` minutes that starts at or after `from` and touches no block. Nil when the rest of the day has none.
    public static func nextOpenSlot(_ blocks: [TimedBlock], duration: Int, from: Int, step: Int = 5, dayEndMin: Int = 1440) -> OpenSlot? {
        let len = max(minBlock, duration)
        let busy = blocks.map { spanOf($0) }.sorted { $0.s < $1.s }
        var start = snapUp(max(0, from), step)
        var guardCount = 0
        while guardCount <= busy.count {
            guard let hit = busy.first(where: { $0.s < start + len && $0.e > start }) else { break }
            start = snapUp(hit.e, step)
            guardCount += 1
        }
        if start + len > dayEndMin { return nil }
        if busy.contains(where: { $0.s < start + len && $0.e > start }) { return nil }
        return OpenSlot(start: LIDate.timeFromMinutes(start), end: LIDate.timeFromMinutes(start + len), startMin: start, endMin: start + len)
    }

    // MARK: shifting flexible blocks

    /// Push the flexible blocks that `anchorId` now runs into.
    ///
    /// Walks the blocks that start at or after `from` in time order. A flexible block the anchor (or an already pushed
    /// block) overlaps moves to start where that one ends, keeping its length. Gaps soak the delay up, so the ripple stops
    /// at the first block that is not overlapped. Fixed blocks never move. When a pushed block would run into one it is
    /// cut short to end where the fixed block starts, as long as minCompressed minutes are left. Otherwise it keeps its
    /// length and the overlap is returned in `conflicts`, never hidden.
    public static func shiftAfter(_ blocks: [DayBlock], anchorId: String, from: Int? = nil) -> ShiftResult {
        guard let anchor = blocks.first(where: { $0.id == anchorId }) else {
            return ShiftResult(blocks: order(blocks), moved: [], conflicts: [])
        }
        let a = spanOf(anchor)
        let floorMin = from ?? a.s
        let rest = order(blocks.filter { $0.id != anchorId })
        var next: [String: DayBlock] = [:]
        var moved: [ShiftChange] = []
        var conflicts: [ShiftConflict] = []

        var cursor = a.e
        var pusher = anchor
        var i = 0
        while i < rest.count {
            let b = rest[i]
            let x = spanOf(b)
            if x.s < floorMin {
                i += 1
                continue
            }
            if x.s >= cursor { break }
            if !b.flexible {
                // Whatever reached this far is sitting on a fixed block.
                let p = next[pusher.id] ?? pusher
                let minutes = min(cursor, x.e) - x.s
                if minutes > 0 && !conflicts.contains(where: { $0.id == p.id && $0.withId == b.id }) {
                    conflicts.append(ShiftConflict(id: p.id, withId: b.id, minutes: minutes))
                }
                cursor = max(cursor, x.e)
                i += 1
                continue
            }
            let len = x.e - x.s
            let wall = rest[(i + 1)...].first(where: { !$0.flexible && spanOf($0).e > cursor })
            let wallStart = wall.map { max(cursor, spanOf($0).s) } ?? dayEnd
            var end = cursor + len
            var cut = 0
            if end > wallStart && wallStart - cursor >= min(minCompressed, len) {
                cut = end - wallStart
                end = wallStart
            }
            let placed = withSpan(b, cursor, end)
            next[b.id] = placed
            moved.append(ShiftChange(
                id: b.id,
                name: b.blockName,
                from: BlockTimeRange(start: b.start, end: b.end),
                to: BlockTimeRange(start: placed.start, end: placed.end),
                cut: cut
            ))
            cursor = spanOf(placed).e
            pusher = placed
            i += 1
        }

        return ShiftResult(blocks: order(blocks.map { next[$0.id] ?? $0 }), moved: moved, conflicts: conflicts)
    }

    // MARK: edits

    /// Move a block to a new start, keeping its length. Nothing else moves.
    public static func moveBlock(_ blocks: [DayBlock], id: String, startMin: Int) -> [DayBlock] {
        return order(blocks.map { b in
            if b.id != id { return b }
            let sp = spanOf(b)
            let len = sp.e - sp.s
            let s = max(0, min(dayEnd - len, startMin))
            return withSpan(b, s, s + len)
        })
    }

    /// Change where a block ends. Making it longer shifts the flexible blocks it runs into. Making it shorter leaves the rest alone.
    public static func resizeBlock(_ blocks: [DayBlock], id: String, endMin: Int) -> ShiftResult {
        guard let target = blocks.first(where: { $0.id == id }) else {
            return ShiftResult(blocks: order(blocks), moved: [], conflicts: [])
        }
        let old = spanOf(target)
        let end = max(old.s + minBlock, min(dayEnd, endMin))
        let resized = blocks.map { $0.id == id ? withSpan($0, old.s, end) : $0 }
        if end <= old.e { return ShiftResult(blocks: order(resized), moved: [], conflicts: []) }
        return shiftAfter(resized, anchorId: id, from: old.e)
    }

    /// "Still going": the block runs to at least `extra` minutes past now (or past its own end when that is later), and what follows shifts.
    public static func stillGoing(_ blocks: [DayBlock], id: String, nowMin: Int, extra: Int = 15, step: Int = 5) -> ShiftResult {
        guard let target = blocks.first(where: { $0.id == id }) else {
            return ShiftResult(blocks: order(blocks), moved: [], conflicts: [])
        }
        let end = snapUp(max(spanOf(target).e, nowMin), step) + extra
        return resizeBlock(blocks, id: id, endMin: end)
    }

    /// Apply a typed edit. An end at or before the start is read as running to the end of the day.
    /// If the block now ends later than before, the flexible blocks behind it shift.
    public static func updateBlock(_ blocks: [DayBlock], id: String, patch: BlockPatch) -> ShiftResult {
        guard let target = blocks.first(where: { $0.id == id }) else {
            return ShiftResult(blocks: order(blocks), moved: [], conflicts: [])
        }
        let old = spanOf(target)
        let s = patch.start.map { LIDate.minutesOf($0) } ?? old.s
        var e: Int
        if let pe = patch.end {
            e = LIDate.minutesOf(pe)
        } else if patch.start != nil {
            e = s + (old.e - old.s)
        } else {
            e = old.e
        }
        if e <= s { e = dayEnd }
        let edited: [DayBlock] = blocks.map { b in
            if b.id != id { return b }
            var named = b
            if let n = patch.blockName {
                let t = n.trimmingCharacters(in: .whitespacesAndNewlines)
                named.blockName = t.isEmpty ? b.blockName : t
            }
            if let f = patch.flexible { named.flexible = f }
            if let k = patch.kind { named.kind = k }
            if let n = patch.note { named.note = n }
            return withSpan(named, s, e)
        }
        guard let after = edited.first(where: { $0.id == id }) else {
            return ShiftResult(blocks: order(edited), moved: [], conflicts: [])
        }
        let now = spanOf(after)
        if now.e > old.e && now.s <= old.e {
            return shiftAfter(edited, anchorId: id, from: max(old.e, now.s))
        }
        return ShiftResult(blocks: order(edited), moved: [], conflicts: [])
    }

    public static func makeBlock(id: String, date: DateStr, name: String, startMin: Int, duration: Int, flexible: Bool = true, kind: BlockKind = .other, note: String? = nil) -> DayBlock {
        let s = max(0, min(dayEnd - minBlock, startMin))
        let e = min(dayEnd, s + max(minBlock, duration))
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return DayBlock(
            id: id,
            date: date,
            blockName: trimmed.isEmpty ? "Block" : trimmed,
            start: LIDate.timeFromMinutes(s),
            end: LIDate.timeFromMinutes(e),
            duration: e - s,
            flexible: flexible,
            kind: kind,
            note: note,
            templateId: nil,
            source: .manual,
            persisted: false
        )
    }

    public static func addBlock(_ blocks: [DayBlock], _ block: DayBlock) -> [DayBlock] {
        return order(blocks + [block])
    }

    public static func removeBlock(_ blocks: [DayBlock], id: String) -> [DayBlock] {
        return order(blocks.filter { $0.id != id })
    }

    // MARK: the 9:00 clock-in errand

    public static let errandName = "Clock-in errand"
    public static let errandStart: TimeStr = "09:00"
    public static let errandMinutes = 60

    public static func findErrand(_ blocks: [DayBlock]) -> DayBlock? {
        return blocks.first(where: { $0.kind == .errand })
    }

    /// Put the errand in as a fixed block and make room for it.
    ///
    /// A flexible block that is under way when the errand starts is cut to end at the errand (or pushed behind it when
    /// under minCompressed would be left). Flexible blocks that start inside the errand shift behind it and the shift
    /// ripples on. Fixed blocks stay, and any that the errand lands on come back in `conflicts`.
    public static func insertErrand(_ blocks: [DayBlock], id: String, date: DateStr, start: TimeStr = errandStart, duration: Int = errandMinutes, name: String = errandName) -> ShiftResult {
        if findErrand(blocks) != nil { return ShiftResult(blocks: order(blocks), moved: [], conflicts: []) }
        let errand = makeBlock(id: id, date: date, name: name, startMin: LIDate.minutesOf(start), duration: duration, flexible: false, kind: .errand)
        let e = spanOf(errand)
        var pre: [ShiftChange] = []
        var conflicts: [ShiftConflict] = []
        var staged: [DayBlock] = []
        for b in blocks {
            let x = spanOf(b)
            let straddles = x.s < e.s && x.e > e.s
            if !straddles || !b.flexible {
                staged.append(b)
                continue
            }
            if e.s - x.s >= minCompressed {
                let cutBlock = withSpan(b, x.s, e.s)
                pre.append(ShiftChange(
                    id: b.id,
                    name: b.blockName,
                    from: BlockTimeRange(start: b.start, end: b.end),
                    to: BlockTimeRange(start: cutBlock.start, end: cutBlock.end),
                    cut: x.e - e.s
                ))
                staged.append(cutBlock)
            } else {
                // Too little would be left in front: line it up to be pushed behind.
                staged.append(withSpan(b, e.s, e.s + (x.e - x.s)))
            }
        }
        for b in blocks {
            let x = spanOf(b)
            if !b.flexible && x.s < e.s && x.e > e.s {
                conflicts.append(ShiftConflict(id: errand.id, withId: b.id, minutes: min(x.e, e.e) - e.s))
            }
        }
        let shifted = shiftAfter(staged + [errand], anchorId: errand.id, from: e.s)
        // Report moves against where each block really started from.
        var original: [String: DayBlock] = [:]
        for b in blocks { original[b.id] = b }
        let all = (pre + shifted.moved).map { m -> ShiftChange in
            guard let o = original[m.id] else { return m }
            var m2 = m
            m2.from = BlockTimeRange(start: o.start, end: o.end)
            return m2
        }
        var idsInOrder: [String] = []
        var byId: [String: ShiftChange] = [:]
        for m in all {
            if let prev = byId[m.id] {
                var merged = m
                merged.cut = prev.cut + m.cut
                byId[m.id] = merged
            } else {
                idsInOrder.append(m.id)
                byId[m.id] = m
            }
        }
        let moved = idsInOrder.compactMap { byId[$0] }
        return ShiftResult(blocks: shifted.blocks, moved: moved, conflicts: conflicts + shifted.conflicts)
    }

    /// Take the errand out. Flexible blocks that came from the template and belong to the morning (template start before
    /// `until`) go back to their template times, which undoes the shift. Hand edits to other blocks stay.
    public static func removeErrand(_ blocks: [DayBlock], template: [ScheduleTemplate], until: TimeStr = "12:00") -> [DayBlock] {
        if findErrand(blocks) == nil { return order(blocks) }
        let limit = LIDate.minutesOf(until)
        var byId: [String: ScheduleTemplate] = [:]
        for t in template { byId[t.id] = t }
        return order(blocks.filter { $0.kind != .errand }.map { b in
            guard let tid = b.templateId, let t = byId[tid], b.flexible, LIDate.minutesOf(t.start) < limit else { return b }
            let s = LIDate.minutesOf(t.start)
            var e = LIDate.minutesOf(t.end)
            if e <= s { e = dayEnd }
            return withSpan(b, s, e)
        })
    }

    // MARK: template to day

    /// Row id for a template block copied into a day. Stable, so a retry cannot double it.
    public static func materializedId(_ date: DateStr, _ templateId: String) -> String {
        return "\(date).\(templateId)"
    }

    /// A DayBlock as a schedule_block row. Template blocks get their stable id, new ones none.
    public static func toRow(_ date: DateStr, _ b: DayBlock) -> JSONObject {
        var row: JSONObject = [
            "date": .string(date),
            "block_name": .string(b.blockName),
            "start": .string(b.start),
            "end": .string(b.end),
            "duration": .int(b.duration),
            "flexible": .bool(b.flexible),
            "kind": .string(b.kind.rawValue),
            "note": JSON.str(b.note),
            "calendar_event_id": JSON.str(b.calendarEventId),
            "template_id": JSON.str(b.templateId),
            "source": .string(b.source.rawValue),
        ]
        if b.persisted {
            row["id"] = .string(b.id)
        } else if b.id.hasPrefix("template:"), let tid = b.templateId {
            row["id"] = .string(materializedId(date, tid))
        } else if !b.id.hasPrefix("new:") && !b.id.hasPrefix("template:") && !b.id.isEmpty {
            // A block the phone made up with its own id keeps it, so a second edit before the first save lands still finds it.
            row["id"] = .string(b.id)
        }
        return row
    }

    /// Copy a day built from the template into rows for that date only. The template itself is never touched.
    public static func materializeDay(_ date: DateStr, _ blocks: [DayBlock]) -> [JSONObject] {
        return order(blocks).map { toRow(date, $0) }
    }

    /// True when the day already has its own rows.
    public static func isMaterialized(_ blocks: [DayBlock]) -> Bool {
        return !blocks.isEmpty && blocks.allSatisfy { $0.persisted }
    }

    static let patchFields = ["block_name", "start", "end", "duration", "flexible", "kind", "note", "calendar_event_id", "template_id", "source"]

    /// The writes that turn `before` (what the day shows now) into `after`.
    /// The first edit to a template day inserts every block, which is what makes the day its own. Later edits touch only the rows that changed.
    public static func planDayWrite(_ date: DateStr, before: [DayBlock], after: [DayBlock]) -> DayWrite {
        var write = DayWrite()
        if !isMaterialized(before) {
            write.insert = materializeDay(date, after)
            return write
        }
        var old: [String: DayBlock] = [:]
        for b in before { old[b.id] = b }
        var kept = Set<String>()
        for b in order(after) {
            guard let prev = old[b.id] else {
                var fresh = b
                fresh.persisted = false
                write.insert.append(toRow(date, fresh))
                continue
            }
            kept.insert(b.id)
            let a = toRow(date, prev)
            let c = toRow(date, b)
            var patch: JSONObject = [:]
            for f in patchFields where a[f] != c[f] {
                patch[f] = c[f]
            }
            if !patch.isEmpty { write.update.append((id: b.id, patch: patch)) }
        }
        for b in before where !kept.contains(b.id) { write.remove.append(b.id) }
        return write
    }

    // MARK: drawing

    /// Side by side columns for blocks that overlap, so none hides another.
    /// Blocks that touch no other get the full width (lane 0 of 1).
    public static func layoutLanes(_ blocks: [DayBlock]) -> [String: BlockLane] {
        let sorted = order(blocks)
        var out: [String: BlockLane] = [:]
        var cluster: [(id: String, lane: Int)] = []
        var ends: [Int] = []
        var clusterEnd = -1
        func flush() {
            for c in cluster { out[c.id] = BlockLane(lane: c.lane, lanes: ends.count) }
            cluster = []
            ends = []
        }
        for b in sorted {
            let x = spanOf(b)
            if !cluster.isEmpty && x.s >= clusterEnd { flush() }
            var lane = ends.firstIndex(where: { $0 <= x.s }) ?? -1
            if lane == -1 {
                lane = ends.count
                ends.append(x.e)
            } else {
                ends[lane] = x.e
            }
            cluster.append((id: b.id, lane: lane))
            clusterEnd = max(clusterEnd, x.e)
        }
        flush()
        return out
    }

    /// First and last minute the timeline should draw, on whole hours.
    public static func timelineRange(_ blocks: [TimedBlock], defaultStart: Int = 5 * 60, defaultEnd: Int = 1440) -> BlockSpan {
        var s = defaultStart
        var e = defaultEnd
        for b in blocks {
            let x = spanOf(b)
            s = min(s, x.s)
            e = max(e, x.e)
        }
        return BlockSpan(s: (s / 60) * 60, e: min(dayEnd, ((e + 59) / 60) * 60))
    }

    // MARK: free time timer

    /// Where the clock is against a block. `nowSeconds` is seconds since midnight.
    public static func timerState(_ block: TimedBlock, nowSeconds: Int) -> FreeTimerState {
        let x = spanOf(block)
        let s = x.s * 60
        let e = x.e * 60
        if nowSeconds < s { return FreeTimerState(phase: .before, remaining: 0, overBy: 0, progress: 0) }
        if nowSeconds < e {
            return FreeTimerState(phase: .live, remaining: e - nowSeconds, overBy: 0, progress: Double(nowSeconds - s) / Double(max(1, e - s)))
        }
        return FreeTimerState(phase: .over, remaining: 0, overBy: nowSeconds - e, progress: 1)
    }

    /// "1:05:09" or "12:34".
    public static func formatCountdown(_ seconds: Int) -> String {
        let t = max(0, seconds)
        let h = t / 3600
        let m = (t % 3600) / 60
        let s = t % 60
        func pad(_ n: Int) -> String { return n < 10 ? "0\(n)" : String(n) }
        return h > 0 ? "\(h):\(pad(m)):\(pad(s))" : "\(m):\(pad(s))"
    }

    /// How long a free block keeps its "time is up" alert after it ends.
    public static let alertWindowSeconds = 30 * 60

    /// The free time block that needs attention right now: one that is live, or one that ended within the alert window and has not been cleared.
    public static func freeTimeFocus(_ blocks: [DayBlock], nowSeconds: Int, cleared: Set<String> = []) -> (block: DayBlock, timer: FreeTimerState)? {
        let free = order(blocks.filter { $0.kind == .free })
        for b in free {
            let timer = timerState(b, nowSeconds: nowSeconds)
            if timer.phase == .live { return (b, timer) }
        }
        for b in free.reversed() {
            let timer = timerState(b, nowSeconds: nowSeconds)
            if timer.phase == .over && timer.overBy <= alertWindowSeconds && !cleared.contains(b.id) { return (b, timer) }
        }
        return nil
    }

    /// Presets on the add sheet. Free time is planned like everything else.
    public static let freePresets: [(name: String, minutes: Int)] = [
        (name: "TV", minutes: 60),
        (name: "Games", minutes: 60),
        (name: "Scrolling", minutes: 30),
    ]

    public static let lengthChoices: [Int] = [15, 30, 45, 60, 90, 120]
}

// MARK: block kinds

extension BlockKind {
    /// Short name for the edit sheet.
    public var label: String {
        switch self {
        case .wake: return "Wake"
        case .workout: return "Workout"
        case .home: return "Home"
        case .classTime: return "Class"
        case .delivery: return "Delivery"
        case .basketball: return "Basketball"
        case .study: return "Study"
        case .bed: return "Bed"
        case .free: return "Free time"
        case .errand: return "Errand"
        case .other: return "Other"
        }
    }

    /// An SF Symbol for the block.
    public var symbol: String {
        switch self {
        case .wake: return "sunrise"
        case .workout: return "dumbbell"
        case .home: return "house"
        case .classTime: return "graduationcap"
        case .delivery: return "bicycle"
        case .basketball: return "basketball"
        case .study: return "book"
        case .bed: return "bed.double"
        case .free: return "tv"
        case .errand: return "mappin"
        case .other: return "circle"
        }
    }

    /// Guess the kind from what the user typed, so "TV" is free time without asking.
    public static func guess(fromName name: String) -> BlockKind {
        let n = name.lowercased()
        func has(_ words: String) -> Bool {
            return n.range(of: "\\b(" + words + ")\\b", options: .regularExpression) != nil
        }
        if has("tv|show|movie|netflix|youtube|game|games|gaming|scroll|scrolling|tiktok|instagram|free time|nap|chill") { return .free }
        if has("deliver|delivery|doordash|uber|instacart|dash") { return .delivery }
        if has("study|homework|read|reading|business|work") { return .study }
        if has("lift|workout|gym|run|jump rope|core") { return .workout }
        if has("basketball|hoop|hoops") { return .basketball }
        if has("class|lecture|lab") { return .classTime }
        if has("errand|clock in|clock-in") { return .errand }
        return .other
    }

    public static let pickable: [BlockKind] = [.wake, .workout, .home, .classTime, .delivery, .basketball, .study, .bed, .free, .errand, .other]
}

// MARK: calendar conflicts

public struct CalendarConflict {
    /// The fixed event: an imported calendar event or a class block.
    public var event: DayBlock
    /// The Lock In block that runs into it.
    public var block: DayBlock
    public var start: TimeStr
    public var end: TimeStr
    public var minutes: Int
}

public struct DayIssue: Identifiable {
    public var key: String
    /// The block to open when the row is tapped.
    public var block: DayBlock
    public var title: String
    public var detail: String
    public var id: String { return key }
}

/// Calendar rules that need no network. Port of the conflict half of src/lib/logic/calendar.ts. The Google half stays on the server.
public enum CalendarRules {
    /// A block that stands for a real commitment the schedule has to fit around.
    public static func isAnchor(_ b: DayBlock) -> Bool {
        return b.source == .calendar || b.kind == .classTime
    }

    /// Overlaps between fixed calendar events (imported events, class) and the other blocks of one day.
    /// Two calendar events on top of each other are not Lock In's problem and are left out.
    public static func findCalendarConflicts(_ blocks: [DayBlock]) -> [CalendarConflict] {
        let sorted = PlanRules.sortBlocks(blocks)
        let anchors = sorted.filter { isAnchor($0) }
        let rest = sorted.filter { !isAnchor($0) }
        var out: [CalendarConflict] = []
        for event in anchors {
            let x = PlanRules.spanOf(event)
            for block in rest {
                let y = PlanRules.spanOf(block)
                let s = max(x.s, y.s)
                let e = min(x.e, y.e)
                if e - s < 1 { continue }
                out.append(CalendarConflict(event: event, block: block, start: LIDate.timeFromMinutes(s), end: LIDate.timeFromMinutes(e), minutes: e - s))
            }
        }
        return out.enumerated().sorted { l, r in
            let a = LIDate.minutesOf(l.element.start)
            let b = LIDate.minutesOf(r.element.start)
            if a != b { return a < b }
            let c = LIDate.minutesOf(l.element.end)
            let d = LIDate.minutesOf(r.element.end)
            if c != d { return c < d }
            return l.offset < r.offset
        }.map { $0.element }
    }

    /// "Delivery overlaps Class"
    public static func describe(_ c: CalendarConflict) -> String {
        return "\(c.block.blockName) overlaps \(c.event.blockName)"
    }

    /// Everything on the day that sits on top of something else. Collisions with class or a calendar event come first, then other overlaps.
    public static func dayIssues(_ blocks: [DayBlock]) -> [DayIssue] {
        var out: [DayIssue] = []
        var seen = Set<String>()
        func pair(_ a: String, _ b: String) -> String { return [a, b].sorted().joined(separator: "|") }
        for c in findCalendarConflicts(blocks) {
            let key = pair(c.event.id, c.block.id)
            seen.insert(key)
            out.append(DayIssue(
                key: key,
                block: c.block,
                title: "\(c.block.blockName) overlaps \(c.event.blockName)",
                detail: "\(LIDate.formatTime(c.start)) to \(LIDate.formatTime(c.end)), \(LIDate.formatDuration(c.minutes))"
            ))
        }
        for o in PlanRules.findOverlaps(blocks) {
            let key = pair(o.a.id, o.b.id)
            if seen.contains(key) { continue }
            // Open the one that can move.
            let block = (o.b.flexible || !o.a.flexible) ? o.b : o.a
            let other = block.id == o.b.id ? o.a : o.b
            var detail = "\(LIDate.formatTime(o.start)) to \(LIDate.formatTime(o.end)), \(LIDate.formatDuration(o.minutes))"
            if !other.flexible { detail += ". \(other.blockName) is fixed" }
            out.append(DayIssue(key: key, block: block, title: "\(block.blockName) overlaps \(other.blockName)", detail: detail))
        }
        return out
    }
}
