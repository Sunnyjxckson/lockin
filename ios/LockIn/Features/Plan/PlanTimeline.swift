import SwiftUI
import LockInKit

/// The day as a vertical timeline. Hold a block to pick it up and drag to move it, pull the grip on its bottom edge to
/// resize it, tap it to edit, tap a gap to add. While a block is resized the preview already shows the flexible blocks
/// after it shifting, using the same pure function the save uses.
struct PlanTimeline: View {
    @Environment(\.liTheme) private var theme

    let blocks: [DayBlock]
    /// Seconds since midnight in New York when this day is today, else nil.
    let nowSeconds: Int?
    let flagged: Set<String>
    let cleared: Set<String>
    let disabled: Bool
    let onOpen: (DayBlock) -> Void
    /// A drag finished. `result` is set for a resize and says what shifted.
    let onCommit: ([DayBlock], ShiftResult?) -> Void
    let onAddAt: (Int) -> Void

    static let pxPerMin: CGFloat = 1.3
    static let gutter: CGFloat = 52
    static let space = "plan.timeline"
    private static let snapStep = 5
    private static let holdSeconds = 0.23

    struct Draft: Equatable {
        var id: String
        var resize: Bool
        var s: Int
        var e: Int
    }

    @State private var draft: Draft? = nil
    @State private var origin: BlockSpan? = nil
    @GestureState private var active = false

    private var range: BlockSpan {
        return PlanRules.timelineRange(blocks.map { $0 as TimedBlock })
    }

    private var preview: [DayBlock] {
        guard let d = draft else { return blocks }
        if d.resize { return PlanRules.resizeBlock(blocks, id: d.id, endMin: d.e).blocks }
        return PlanRules.moveBlock(blocks, id: d.id, startMin: d.s)
    }

    var body: some View {
        let r = range
        let shown = preview
        let height = CGFloat(r.e - r.s) * PlanTimeline.pxPerMin
        let lanes = laneMap(shown)
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                gaps(r, width: geo.size.width)
                hourLines(r, width: geo.size.width)
                nowLine(r, width: geo.size.width)
                ForEach(shown) { b in
                    blockView(b, range: r, lanes: lanes, area: geo.size.width - PlanTimeline.gutter - 4)
                }
                gutterPill(r)
            }
            .frame(width: geo.size.width, height: height + 12, alignment: .topLeading)
            .coordinateSpace(name: PlanTimeline.space)
        }
        .frame(height: height + 12)
        .onChange(of: active) { _, isActive in
            // The system cancelled the gesture: put the block back.
            if !isActive && draft != nil { finish(commit: false) }
        }
    }

    private func laneMap(_ shown: [DayBlock]) -> [String: BlockLane] {
        if let d = draft, !d.resize {
            return PlanRules.layoutLanes(shown.filter { $0.id != d.id })
        }
        return PlanRules.layoutLanes(shown)
    }

    private func y(_ minute: Int, _ r: BlockSpan) -> CGFloat {
        return CGFloat(minute - r.s) * PlanTimeline.pxPerMin
    }

    // MARK: background layers

    private func gaps(_ r: BlockSpan, width: CGFloat) -> some View {
        let height = CGFloat(r.e - r.s) * PlanTimeline.pxPerMin + 12
        return Color.clear
            .frame(width: width, height: height)
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { point in
                if disabled || draft != nil { return }
                let minute = Double(r.s) + Double(point.y / PlanTimeline.pxPerMin)
                let snapped = Int(minute / 15) * 15
                onAddAt(max(r.s, min(PlanRules.dayEnd - 15, snapped)))
            }
    }

    private func hourLines(_ r: BlockSpan, width: CGFloat) -> some View {
        let hours = Array(stride(from: r.s, through: r.e, by: 60))
        let pillMinute = pillAt(r)
        return ZStack(alignment: .topLeading) {
            ForEach(hours, id: \.self) { m in
                hourLine(m, r, width: width, hidden: pillMinute.map { abs(y(m, r) - y($0, r)) < 16 } ?? false)
            }
        }
        .allowsHitTesting(false)
    }

    private func hourLine(_ m: Int, _ r: BlockSpan, width: CGFloat, hidden: Bool) -> some View {
        let top = y(m, r)
        return ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(theme.hair)
                .frame(width: max(0, width - PlanTimeline.gutter), height: 1)
                .offset(x: PlanTimeline.gutter, y: top)
            if !hidden {
                Text(hourLabel(m))
                    .liType(.caption)
                    .foregroundColor(theme.ink2)
                    .frame(width: 44, alignment: .trailing)
                    .offset(x: 0, y: top - 7)
            }
        }
    }

    private func hourLabel(_ minute: Int) -> String {
        if minute >= PlanRules.dayEnd { return "12 AM" }
        let h = (minute / 60) % 24
        let h12 = h % 12 == 0 ? 12 : h % 12
        return "\(h12) \(h < 12 ? "AM" : "PM")"
    }

    private var nowMinute: Double? {
        guard let s = nowSeconds else { return nil }
        return Double(s) / 60
    }

    private func nowInView(_ r: BlockSpan) -> Double? {
        guard let m = nowMinute, m >= Double(r.s), m <= Double(r.e) else { return nil }
        return m
    }

    private func pillAt(_ r: BlockSpan) -> Int? {
        if let d = draft { return d.resize ? d.e : d.s }
        if let m = nowInView(r) { return Int(m) }
        return nil
    }

    @ViewBuilder
    private func nowLine(_ r: BlockSpan, width: CGFloat) -> some View {
        if let m = nowInView(r) {
            Capsule()
                .fill(theme.accent)
                .frame(width: max(0, width - PlanTimeline.gutter + 2), height: 2)
                .offset(x: PlanTimeline.gutter - 2, y: CGFloat(m - Double(r.s)) * PlanTimeline.pxPerMin - 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func gutterPill(_ r: BlockSpan) -> some View {
        if let d = draft {
            let minute = d.resize ? d.e : d.s
            pill(LIDate.formatTime(LIDate.timeFromMinutes(minute)), dragging: true)
                .offset(x: 0, y: y(minute, r) - 10)
        } else if let m = nowInView(r) {
            pill(LIDate.formatTime(LIDate.timeFromMinutes(Int(m))), dragging: false)
                .offset(x: 0, y: CGFloat(m - Double(r.s)) * PlanTimeline.pxPerMin - 10)
        }
    }

    private func pill(_ text: String, dragging: Bool) -> some View {
        return Text(text.replacingOccurrences(of: " ", with: ""))
            .liType(.caption)
            .foregroundColor(dragging ? theme.bg : theme.accentInk)
            .lineLimit(1)
            .frame(width: 46, height: 20)
            .background(Capsule().fill(dragging ? AnyShapeStyle(theme.ink) : AnyShapeStyle(theme.gradient)))
            .allowsHitTesting(false)
    }

    // MARK: blocks

    private func blockView(_ b: DayBlock, range r: BlockSpan, lanes: [String: BlockLane], area: CGFloat) -> some View {
        let span = PlanRules.spanOf(b)
        let dragging = draft?.id == b.id
        let lane: BlockLane = (dragging && draft?.resize == false) ? BlockLane(lane: 0, lanes: 1) : (lanes[b.id] ?? BlockLane(lane: 0, lanes: 1))
        let h = max(20, CGFloat(span.e - span.s) * PlanTimeline.pxPerMin - 3)
        let count = CGFloat(max(1, lane.lanes))
        let width = max(30, area / count - (lane.lanes > 1 ? 2 : 0))
        let x = PlanTimeline.gutter + 4 + area * CGFloat(lane.lane) / count + (lane.lane > 0 ? 2 : 0)
        let top = y(span.s, r)
        let original = blocks.first(where: { $0.id == b.id })
        let shifted = draft != nil && !dragging && original != nil && (original?.start != b.start || original?.end != b.end)
        return PlanBlockCell(
            block: b,
            nowSeconds: nowSeconds,
            height: h,
            lanes: lane.lanes,
            dragging: dragging,
            resizing: dragging && draft?.resize == true,
            shifted: shifted,
            warn: flagged.contains(b.id),
            cleared: cleared.contains(b.id),
            canGrip: !disabled
        )
        .frame(width: width, height: h)
        .overlay(alignment: .bottom) {
            if h >= 44 && !disabled {
                gripView(b)
                    .frame(width: 88, height: 22)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if !disabled && draft == nil { onOpen(b) }
        }
        .gesture(moveGesture(b), including: disabled ? GestureMask.subviews : GestureMask.all)
        .zIndex(dragging ? 5 : 1)
        .offset(x: x, y: top)
        .animation(dragging ? nil : .easeOut(duration: 0.15), value: top)
        .animation(dragging ? nil : .easeOut(duration: 0.15), value: h)
    }

    private func moveGesture(_ b: DayBlock) -> some Gesture {
        return LongPressGesture(minimumDuration: PlanTimeline.holdSeconds, maximumDistance: 10)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(PlanTimeline.space)))
            .updating($active) { value, state, _ in
                if case .second(true, _) = value { state = true }
            }
            .onChanged { value in
                if case .second(true, let drag) = value {
                    track(b, resize: false, translation: drag?.translation.height ?? 0)
                }
            }
            .onEnded { _ in
                finish(commit: true)
            }
    }

    private func gripView(_ b: DayBlock) -> some View {
        return Color.clear
            .overlay(alignment: .bottom) {
                Capsule()
                    .fill(theme.ink2)
                    .frame(width: 28, height: 3)
                    .padding(.bottom, 5)
            }
            .contentShape(Rectangle())
            .highPriorityGesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .named(PlanTimeline.space))
                    .updating($active) { _, state, _ in state = true }
                    .onChanged { value in
                        track(b, resize: true, translation: value.translation.height)
                    }
                    .onEnded { _ in
                        finish(commit: true)
                    }
            )
    }

    // MARK: gesture bookkeeping

    private func track(_ b: DayBlock, resize: Bool, translation: CGFloat) {
        if draft == nil || draft?.id != b.id {
            let span = PlanRules.spanOf(b)
            origin = span
            LIHaptics.tap()
            draft = Draft(id: b.id, resize: resize, s: span.s, e: span.e)
        }
        guard let o = origin else { return }
        let delta = PlanRules.snap(Int((translation / PlanTimeline.pxPerMin).rounded()), PlanTimeline.snapStep)
        let len = o.e - o.s
        var next: Draft
        if resize {
            let e = max(o.s + PlanRules.minBlock, min(PlanRules.dayEnd, PlanRules.snap(o.e + delta, PlanTimeline.snapStep)))
            next = Draft(id: b.id, resize: true, s: o.s, e: e)
        } else {
            let s = max(range.s, min(PlanRules.dayEnd - len, PlanRules.snap(o.s + delta, PlanTimeline.snapStep)))
            next = Draft(id: b.id, resize: false, s: s, e: s + len)
        }
        if next != draft { draft = next }
    }

    private func finish(commit: Bool) {
        let d = draft
        let o = origin
        draft = nil
        origin = nil
        guard commit, let draftNow = d, let start = o else { return }
        if draftNow.resize {
            if draftNow.e != start.e {
                let result = PlanRules.resizeBlock(blocks, id: draftNow.id, endMin: draftNow.e)
                onCommit(result.blocks, result)
            }
        } else if draftNow.s != start.s {
            onCommit(PlanRules.moveBlock(blocks, id: draftNow.id, startMin: draftNow.s), nil)
        }
    }
}

/// One block on the timeline: its look, its text, its countdown. The gestures are on the timeline.
struct PlanBlockCell: View {
    @Environment(\.liTheme) private var theme

    let block: DayBlock
    let nowSeconds: Int?
    let height: CGFloat
    let lanes: Int
    let dragging: Bool
    let resizing: Bool
    let shifted: Bool
    let warn: Bool
    let cleared: Bool
    let canGrip: Bool

    private var timer: FreeTimerState? {
        guard let s = nowSeconds else { return nil }
        return PlanRules.timerState(block, nowSeconds: s)
    }

    private var live: Bool { return timer?.phase == .live && !dragging }
    private var past: Bool { return timer?.phase == .over }
    private var alert: Bool {
        guard block.kind == .free, past, !cleared, let t = timer else { return false }
        return t.overBy <= PlanRules.alertWindowSeconds
    }
    private var tiny: Bool { return height < 30 }
    private var oneLine: Bool { return height < 62 }
    private var radius: CGFloat { return tiny ? 10 : 16 }

    var body: some View {
        ZStack(alignment: .topLeading) {
            plate
            content
            if !block.flexible && !live {
                Rectangle()
                    .fill(past ? theme.ink3 : theme.ink2)
                    .frame(width: 3)
                    .frame(maxHeight: .infinity)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(stroke, lineWidth: 1))
        .shadow(color: dragging ? Color.black.opacity(0.35) : Color.clear, radius: dragging ? 14 : 0, y: dragging ? 6 : 0)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(block.blockName), \(LIDate.formatTime(block.start)) to \(LIDate.formatTime(block.end))\(block.flexible ? "" : ", fixed")")
        .accessibilityHint("Opens the block to edit")
        .accessibilityAddTraits(.isButton)
    }

    private var stroke: Color {
        if dragging { return theme.ink }
        if live { return theme.accent.opacity(0.6) }
        if alert { return theme.warn.opacity(0.6) }
        if warn { return theme.warn }
        if shifted { return theme.ink2 }
        if past { return theme.tileLine }
        return Color.clear
    }

    @ViewBuilder
    private var plate: some View {
        if dragging {
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(theme.surface3)
        } else if live {
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(theme.bg)
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(theme.accentSoft)
            }
        } else if alert {
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(theme.bg)
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(theme.warnSoft)
            }
        } else if past {
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(theme.bg)
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(theme.bg)
                if block.flexible {
                    LIGlassSurface(radius: radius)
                } else {
                    LITileSurface(radius: radius)
                }
            }
        }
    }

    private var main: Color { return past && !alert && !dragging ? theme.ink2 : theme.ink }

    private var timeText: String {
        var text = "\(LIDate.formatTime(block.start)) to \(LIDate.formatTime(block.end))"
        if height >= 46 && lanes == 1 { text += ", " + LIDate.formatDuration(block.duration) }
        return text
    }

    private var content: some View {
        HStack(alignment: tiny || oneLine ? .center : .top, spacing: 10) {
            if !tiny && lanes == 1 {
                Image(systemName: block.source == .calendar ? "calendar" : block.kind.symbol)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(theme.ink2)
                    .frame(width: 18)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(block.blockName)
                    .liType(tiny ? .caption : .body)
                    .foregroundColor(main)
                    .lineLimit(1)
                if !(oneLine && (lanes > 1 || (block.kind == .free && live))) {
                    Text(timeText)
                        .liType(.caption)
                        .foregroundColor(dragging || shifted ? theme.ink : theme.ink2)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            trailing
        }
        .padding(.leading, block.flexible || live ? 14 : 16)
        .padding(.trailing, 12)
        .padding(.top, tiny || oneLine ? 0 : 10)
    }

    @ViewBuilder
    private var trailing: some View {
        if block.kind == .free && live, let t = timer {
            Text(PlanRules.formatCountdown(t.remaining))
                .liType(.value)
                .monospacedDigit()
                .foregroundColor(theme.ink)
        } else if alert {
            Text("Time is up").liType(.label).foregroundColor(theme.warn)
        } else if live {
            Text("Now").liType(.label).foregroundColor(theme.accent)
        } else if !block.flexible && !tiny {
            Image(systemName: "lock")
                .font(.system(size: 12, weight: .regular))
                .foregroundColor(theme.ink2)
        }
    }
}
