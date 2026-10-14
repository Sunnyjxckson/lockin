import SwiftUI
import LockInKit

/// Boards: the worlds you are locking in toward, one per track. Each opens into its collage.
/// The look of the whole app can be taken from any of them.
struct BoardsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        BoardsRoot(store: store)
    }
}

private struct BoardsRoot: View {
    @Environment(AppStore.self) private var appStore
    @Environment(\.liTheme) private var theme
    @State private var model: BoardsModel
    @State private var creating = false
    @State private var toast: String? = nil

    init(store: AppStore) {
        _model = State(initialValue: BoardsModel(store: store))
    }

    var body: some View {
        let summaries = model.summaries
        return LIScreen {
            HStack(alignment: .top) {
                LIPageHeader("Boards")
                LXIconButton(systemName: "plus", label: "New board") { creating = true }
                    .padding(.top, 14)
            }
            if let failure = model.failure {
                LINotice(failure, actionTitle: "Retry") { Task { await model.refresh() } }.padding(.bottom, 10)
            }
            if model.loading {
                HStack { Spacer(); ProgressView().tint(theme.ink2); Spacer() }.padding(.top, 60)
            } else if summaries.isEmpty {
                LIEmptyState(title: "No boards yet", message: "Set the world first: the body, the brand, the life.", actionTitle: "Start a board") { creating = true }
                    .padding(.top, 20)
            } else {
                VStack(spacing: 14) {
                    ForEach(Array(summaries.enumerated()), id: \.element.board.id) { i, s in
                        NavigationLink {
                            BoardDetailView(model: model, boardId: s.board.id)
                        } label: {
                            BoardCard(summary: s, index: i, wearing: appStore.themeRow?.palette != nil && appStore.themeRow?.boardId == s.board.id)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 4)
            }

            if !model.loading, let row = appStore.themeRow, row.palette != nil {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("The look of the app").liType(.label).foregroundColor(theme.ink2)
                        Text(row.name ?? "Custom").liType(.body).foregroundColor(theme.ink).lineLimit(1)
                        Text("On top of \(ThemeBuild.baseName(row.base))").liType(.caption).foregroundColor(theme.ink2)
                    }
                    Spacer(minLength: 8)
                    LISecondaryButton("Back to base") { resetLook(row.base) }
                }
                .padding(.vertical, 12)
                .padding(.leading, 18)
                .padding(.trailing, 12)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
                .padding(.top, 28)
            }
        }
        .refreshable { await model.refresh() }
        .task { await model.load() }
        .lxToast($toast)
        .sheet(isPresented: $creating) {
            BoardEditSheet(model: model, board: nil, taken: summaries.map { $0.board.kind }, onClose: { creating = false }, onToast: { toast = $0 })
                .liSheetStyle()
        }
    }

    private func resetLook(_ base: ThemeBase) {
        Task {
            do {
                try await appStore.resetThemePalette()
                LIHaptics.tap()
                toast = "Back to \(ThemeBuild.baseName(base))"
            } catch {
                LIHaptics.error()
                toast = BoardsModel.describe(error)
            }
        }
    }
}

private struct BoardCard: View {
    @Environment(\.liTheme) private var theme
    let summary: BoardSummary
    let index: Int
    let wearing: Bool

    var body: some View {
        let board = summary.board
        let cover = summary.cover
        let second = summary.items.filter { $0.kind == .image && $0.id != cover?.id }.prefix(2)
        return VStack(alignment: .leading, spacing: 0) {
            if let cover = cover {
                HStack(spacing: 6) {
                    BoardImage(url: cover.imageUrl, tone: cover.palette?.first)
                        .aspectRatio(4.0 / 5.0, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .frame(maxWidth: .infinity)
                    if !second.isEmpty {
                        GeometryReader { geo in
                            VStack(spacing: 6) {
                                ForEach(Array(second), id: \.id) { i in
                                    BoardImage(url: i.imageUrl, tone: i.palette?.first)
                                        .frame(maxHeight: .infinity)
                                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                }
                                if second.count == 1 && !summary.palette.isEmpty {
                                    VStack(spacing: 0) {
                                        ForEach(Array(summary.palette.prefix(5)), id: \.self) { c in
                                            Rectangle().fill(Color(hex: c))
                                        }
                                    }
                                    .frame(maxHeight: .infinity)
                                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                }
                            }
                            .frame(width: geo.size.width, height: geo.size.height)
                        }
                        .frame(width: 110)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, 8)
            }
            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(String(format: "%02d", index + 1) + " / " + BoardsCore.kindLabel(board.kind)).liType(.label).foregroundColor(theme.ink2)
                    Text(board.name).liType(.h1).foregroundColor(theme.ink).multilineTextAlignment(.leading)
                    if wearing {
                        Text("The app is wearing this board.").liType(.caption).foregroundColor(theme.accent)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 5) {
                    Text("\(summary.items.count)").liType(.stat).foregroundColor(theme.ink)
                    Text(summary.items.count == 1 ? "piece" : "pieces").liType(.label).foregroundColor(theme.ink2)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 18)
            if cover == nil {
                Text(summary.items.isEmpty ? "Empty. Open it and add the first piece." : "No images yet.")
                    .liType(.sub).foregroundColor(theme.ink2)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 18)
            }
            BoardPaletteStrip(colors: summary.palette, height: 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LIGlassSurface(radius: 26))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(board.name), \(BoardsModel.countLabel(summary.items.count))")
    }
}

/// Make a board, or change one: its name, what it is for, where it sits in the list, and deleting it.
struct BoardEditSheet: View {
    @Environment(\.liTheme) private var theme
    let model: BoardsModel
    let board: Board?
    let taken: [BoardKind]
    let onClose: () -> Void
    let onToast: (String) -> Void
    var onDeleted: (() -> Void)? = nil

    @State private var name: String
    @State private var kind: BoardKind
    @State private var busy = false
    @State private var confirm = false

    init(model: BoardsModel, board: Board?, taken: [BoardKind], onClose: @escaping () -> Void, onToast: @escaping (String) -> Void, onDeleted: (() -> Void)? = nil) {
        self.model = model
        self.board = board
        self.taken = taken
        self.onClose = onClose
        self.onToast = onToast
        self.onDeleted = onDeleted
        _name = State(initialValue: board?.name ?? "")
        _kind = State(initialValue: board?.kind ?? BoardKind.allCases.first(where: { !taken.contains($0) }) ?? .life)
    }

    private var index: Int? { return board.flatMap { b in model.boards.firstIndex { $0.id == b.id } } }

    var body: some View {
        LXSheet(title: board == nil ? "New board" : "Board", subtitle: board == nil ? "The body, the brand, the life." : nil) {
            VStack(alignment: .leading, spacing: 20) {
                LXField(label: "Name", text: $name, placeholder: "\(BoardsCore.kindLabel(kind)) board")
                VStack(alignment: .leading, spacing: 8) {
                    Text("What it is for").liType(.sub).foregroundColor(theme.ink2)
                    LISegmentedControl(options: BoardKind.allCases.map { (value: $0, title: BoardsCore.kindLabel($0)) }, selection: $kind)
                    Text(BoardsCore.kindHint(kind)).liType(.sub).foregroundColor(theme.ink2)
                }
                if board != nil, let i = index, model.boards.count > 1 {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Order").liType(.sub).foregroundColor(theme.ink2)
                        HStack(spacing: 10) {
                            LXWideButton(title: "Move up", disabled: i == 0) { move(i, -1) }
                            LXWideButton(title: "Move down", disabled: i >= model.boards.count - 1) { move(i, 1) }
                        }
                        Text("The first board is the one Today opens.").liType(.sub).foregroundColor(theme.ink2)
                    }
                }
                if let b = board {
                    let pieces = model.itemsOf(b.id).count
                    LXDangerButton(title: confirm ? (pieces > 0 ? "Tap again to delete it and its \(BoardsModel.countLabel(pieces))" : "Tap again to delete") : "Delete board") {
                        if !confirm {
                            confirm = true
                            return
                        }
                        delete(b)
                    }
                }
            }
        } footer: {
            LXPrimaryButton(title: board == nil ? "Create board" : "Save", busy: busy) { save() }
        }
    }

    private func move(_ i: Int, _ by: Int) {
        guard let b = board else { return }
        let ids = BoardsCore.moveId(model.boards.map { $0.id }, b.id, to: i + by)
        Task {
            do {
                try await model.reorderBoards(ids)
                LIHaptics.tap()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
            }
        }
    }

    private func save() {
        if busy { return }
        busy = true
        Task {
            do {
                if let b = board {
                    try await model.saveBoard(b.id, name: name, kind: kind)
                } else {
                    try await model.createBoard(name: name, kind: kind)
                    onToast("Board created")
                }
                LIHaptics.celebrate()
                onClose()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
                busy = false
            }
        }
    }

    private func delete(_ b: Board) {
        if busy { return }
        busy = true
        Task {
            do {
                try await model.deleteBoard(b.id)
                onToast("Board deleted")
                onClose()
                onDeleted?()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
                busy = false
            }
        }
    }
}
