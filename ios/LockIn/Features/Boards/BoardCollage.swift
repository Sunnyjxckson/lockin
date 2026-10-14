import SwiftUI
import LockInKit

/// The board itself: a collage of images, swatches and notes, laid out by BoardsCore.layoutBoard.
/// Press and hold a piece, then drag, to move it. The others slide out of the way as it passes.
struct BoardCollage: View {
    @Environment(\.liTheme) private var theme
    let items: [BoardItem]
    let width: Double
    var gap: Double = 6
    var bare: Bool = false
    var onOpen: ((BoardItem) -> Void)? = nil
    var onReorder: (([String]) -> Void)? = nil

    @State private var order: [String]? = nil
    @State private var dragId: String? = nil
    @State private var point: CGPoint = .zero
    @State private var lastSwap: (id: String, x: Double, y: Double)? = nil

    private var byId: [String: BoardItem] {
        var out: [String: BoardItem] = [:]
        for i in items { out[i.id] = i }
        return out
    }

    private var ids: [String] {
        let base = items.map { $0.id }
        guard let order = order else { return base }
        let have = Set(base)
        let kept = order.filter { have.contains($0) }
        let keptSet = Set(kept)
        return kept + base.filter { !keptSet.contains($0) }
    }

    private func layoutOf(_ ids: [String]) -> BoardLayout {
        let map = byId
        let inputs: [TileInput] = ids.compactMap { id in
            guard let item = map[id] else { return nil }
            let kind: TileInput.Kind = item.kind == .image ? .image : (item.kind == .color ? .color : .note)
            return TileInput(id: id, kind: kind, aspect: item.aspect, chars: item.note?.count ?? 0, link: item.sourceUrl != nil)
        }
        return BoardsCore.layoutBoard(inputs, width: width, gap: gap)
    }

    var body: some View {
        let currentIds = ids
        let layout = layoutOf(currentIds)
        let map = byId
        return ZStack(alignment: .topLeading) {
            ForEach(layout.tiles, id: \.id) { t in
                if let item = map[t.id] {
                    tile(item, t, layout, currentIds)
                }
            }
        }
        .frame(width: width, height: layout.height, alignment: .topLeading)
        .coordinateSpace(name: "collage")
        .animation(.easeOut(duration: 0.22), value: currentIds)
        .onChange(of: items.map { $0.id }) { _, _ in
            if dragId == nil { order = nil }
        }
    }

    @ViewBuilder
    private func tile(_ item: BoardItem, _ t: TileRect, _ layout: BoardLayout, _ currentIds: [String]) -> some View {
        let dragging = dragId == t.id
        let radius: CGFloat = bare ? 0 : 14
        let x: CGFloat = dragging ? point.x - CGFloat(t.w) / 2 : CGFloat(t.x)
        let y: CGFloat = dragging ? point.y - CGFloat(t.h) / 2 : CGFloat(t.y)
        content(item, t)
            .frame(width: CGFloat(t.w), height: CGFloat(t.h))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .scaleEffect(dragging ? 1.04 : 1)
            .shadow(color: Color.black.opacity(dragging ? 0.35 : 0), radius: 14, x: 0, y: 8)
            .offset(x: x, y: y)
            .zIndex(dragging ? 10 : 0)
            .animation(dragging ? nil : .easeOut(duration: 0.22), value: x)
            .animation(dragging ? nil : .easeOut(duration: 0.22), value: y)
            .onTapGesture {
                if dragId == nil, let open = onOpen {
                    LIHaptics.tap()
                    open(item)
                }
            }
            .gesture(reorderGesture(t.id, layout, currentIds))
            .accessibilityElement(children: .combine)
            .accessibilityLabel(label(item))
            .accessibilityAddTraits(onOpen != nil ? .isButton : [])
    }

    private func label(_ item: BoardItem) -> String {
        switch item.kind {
        case .image: return item.note ?? "Image"
        case .color: return "Color \(item.color ?? "")" + (item.note.map { ", \($0)" } ?? "")
        case .note: return item.note ?? (BoardsCore.linkHost(item.sourceUrl) ?? "Note")
        }
    }

    private func reorderGesture(_ id: String, _ layout: BoardLayout, _ currentIds: [String]) -> some Gesture {
        LongPressGesture(minimumDuration: 0.26)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named("collage")))
            .onChanged { value in
                guard onReorder != nil else { return }
                switch value {
                case .second(true, let drag):
                    if dragId != id {
                        dragId = id
                        order = currentIds
                        lastSwap = nil
                        LIHaptics.check()
                    }
                    if let d = drag {
                        point = d.location
                        consider(id, layout)
                    }
                default:
                    break
                }
            }
            .onEnded { _ in
                if dragId != nil, let done = order {
                    onReorder?(done)
                }
                dragId = nil
                lastSwap = nil
            }
    }

    private func consider(_ id: String, _ layout: BoardLayout) {
        // The layout under the finger is the one for the order being dragged.
        let live = layoutOf(order ?? ids)
        guard let target = BoardsCore.tileAt(live, x: Double(point.x), y: Double(point.y)), target.id != id else { return }
        // After a swap the same neighbor can land back under the finger. Wait for real movement before swapping again.
        if let prev = lastSwap, prev.id == target.id, hypot(Double(point.x) - prev.x, Double(point.y) - prev.y) < 28 { return }
        let now = order ?? ids
        guard let to = now.firstIndex(of: target.id) else { return }
        order = BoardsCore.moveId(now, id, to: to)
        lastSwap = (id: target.id, x: Double(point.x), y: Double(point.y))
        LIHaptics.tap()
    }

    @ViewBuilder
    private func content(_ item: BoardItem, _ t: TileRect) -> some View {
        switch item.kind {
        case .image:
            BoardImage(url: item.imageUrl, tone: item.palette?.first)
        case .color:
            let hex = item.color ?? "#808080"
            ZStack(alignment: .bottomLeading) {
                Rectangle().fill(Color(hex: hex))
                VStack(alignment: .leading, spacing: 3) {
                    if let n = item.note, !n.isEmpty {
                        Text(n).liType(.h2).foregroundColor(boardInk(hex)).lineLimit(2)
                    }
                    Text(hex.replacingOccurrences(of: "#", with: "")).liType(.label).foregroundColor(boardInk(hex))
                }
                .padding(12)
            }
        case .note:
            let m = BoardsCore.noteMetrics(chars: item.note?.count ?? 0, width: t.w, link: item.sourceUrl != nil)
            ZStack(alignment: .topLeading) {
                Rectangle().fill(theme.surface2)
                VStack(alignment: .leading, spacing: 6) {
                    if let n = item.note, !n.isEmpty {
                        Text(n)
                            .font(LIFont.medium(CGFloat(m.fontSize)))
                            .foregroundColor(theme.ink)
                            .lineLimit(m.lines + 2)
                            .fixedSize(horizontal: false, vertical: false)
                    }
                    if let host = BoardsCore.linkHost(item.sourceUrl) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.right").font(.system(size: 10))
                            Text(host).liType(.caption).lineLimit(1)
                        }
                        .foregroundColor(theme.ink2)
                    }
                }
                .padding(CGFloat(BoardsCore.notePad))
                if !bare {
                    RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1)
                }
            }
        }
    }
}
