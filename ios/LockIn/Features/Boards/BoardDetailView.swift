import SwiftUI
import UIKit
import PhotosUI
import LockInKit

/// One board: the collage, the pieces behind it, and the way to wear it.
struct BoardDetailView: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Environment(AppStore.self) private var appStore
    let model: BoardsModel
    let boardId: String

    @State private var width: Double = 0
    @State private var adding = false
    @State private var editing = false
    @State private var open: BoardItem? = nil
    @State private var look: LookSource? = nil
    @State private var full = false
    @State private var toast: String? = nil

    private var board: Board? { return model.boards.first { $0.id == boardId } }
    private var items: [BoardItem] { return model.itemsOf(boardId) }

    var body: some View {
        Group {
            if let board = board {
                content(board)
            } else {
                ZStack {
                    LIBackground()
                    LIEmptyState(title: "Board not found", message: "It may have been deleted.", actionTitle: "Go back") { dismiss() }
                        .padding(20)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func content(_ board: Board) -> some View {
        let list = items
        let palette = BoardsCore.boardPalette(list)
        let wearing = appStore.themeRow?.palette != nil && appStore.themeRow?.boardId == board.id
        return LIScreen {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(BoardsCore.kindLabel(board.kind)).liType(.label).foregroundColor(theme.ink2)
                    Text(board.name).liType(.title).foregroundColor(theme.ink).fixedSize(horizontal: false, vertical: true)
                    Text(BoardsModel.countLabel(list.count)).liType(.sub).foregroundColor(theme.ink2)
                }
                Spacer(minLength: 8)
                HStack(spacing: 8) {
                    if !list.isEmpty {
                        LXIconButton(systemName: "arrow.up.left.and.arrow.down.right", label: "Full screen") { full = true }
                    }
                    LXIconButton(systemName: "ellipsis", label: "Board settings") { editing = true }
                    LXIconButton(systemName: "plus", label: "Add a piece") { adding = true }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 18)

            if list.isEmpty {
                LIEmptyState(title: "Nothing here yet", message: BoardsCore.kindHint(board.kind), actionTitle: "Add the first piece") { adding = true }
            } else {
                Color.clear
                    .frame(height: 0)
                    .background(GeometryReader { geo in
                        Color.clear
                            .onAppear { width = Double(geo.size.width) }
                            .onChange(of: geo.size.width) { _, w in width = Double(w) }
                    })
                if width > 0 {
                    BoardCollage(
                        items: list,
                        width: width,
                        onOpen: { open = $0 },
                        onReorder: { ids in
                            Task {
                                do {
                                    try await model.reorderItems(boardId: boardId, ids)
                                } catch {
                                    LIHaptics.error()
                                    toast = BoardsModel.describe(error)
                                }
                            }
                        }
                    )
                    .onAppear { measure(list) }
                    .onChange(of: list.count) { _, _ in measure(model.itemsOf(boardId)) }
                }
                Text("Press and hold a piece to move it.").liType(.caption).foregroundColor(theme.ink3).padding(.top, 12)

                if !palette.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Palette").liType(.label).foregroundColor(theme.ink2)
                        BoardPaletteStrip(colors: palette, height: 36)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        HStack(spacing: 10) {
                            LXPrimaryButton(title: wearing ? "Adjust the look" : "Set as the look") { look = LookSource(imageId: nil) }
                        }
                    }
                    .padding(.top, 28)
                }
            }
        }
        .task { if model.boards.isEmpty { await model.load() } }
        .lxToast($toast)
        .sheet(isPresented: $adding) {
            BoardAddSheet(model: model, boardId: boardId, onClose: { adding = false }, onToast: { toast = $0 })
                .liSheetStyle()
        }
        .sheet(isPresented: $editing) {
            BoardEditSheet(model: model, board: board, taken: [], onClose: { editing = false }, onToast: { toast = $0 }, onDeleted: { dismiss() })
                .liSheetStyle()
        }
        .sheet(item: $open) { item in
            BoardItemSheet(model: model, itemId: item.id, onClose: { open = nil }, onToast: { toast = $0 }, onLook: { id in
                open = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { look = LookSource(imageId: id) }
            })
            .liSheetStyle()
        }
        .sheet(item: $look) { src in
            LookStudio(model: model, boardId: boardId, source: src, onClose: { look = nil }, onToast: { toast = $0 })
                .liSheetStyle()
        }
        .fullScreenCover(isPresented: $full) {
            BoardFullScreen(items: model.itemsOf(boardId), name: board.name, onClose: { full = false })
        }
    }

    /// Images saved without a shape get theirs from the first load, so the collage stops jumping.
    private func measure(_ list: [BoardItem]) {
        for item in list where item.kind == .image && item.aspect == nil {
            guard let address = item.imageUrl, let url = URL(string: address) else { continue }
            Task {
                guard let (data, _) = try? await URLSession.shared.data(from: url), let image = UIImage(data: data), image.size.height > 0 else { return }
                await MainActor.run { model.rememberAspect(item, aspect: Double(image.size.width / image.size.height)) }
            }
        }
    }
}

/// What the Look studio starts from: the whole board, or one image.
struct LookSource: Identifiable {
    var imageId: String?
    var id: String { return imageId ?? "board" }
}

// MARK: full screen

struct BoardFullScreen: View {
    @Environment(\.liTheme) private var theme
    let items: [BoardItem]
    let name: String
    let onClose: () -> Void
    @State private var width: Double = 0

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()
            GeometryReader { geo in
                ScrollView(showsIndicators: false) {
                    BoardCollage(items: items, width: Double(geo.size.width), gap: 2, bare: true)
                        .frame(width: geo.size.width)
                }
                .ignoresSafeArea()
            }
            Button {
                LIHaptics.tap()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }
            .padding(16)
            .accessibilityLabel("Close")
        }
        .accessibilityLabel(name)
    }
}

// MARK: adding

private enum AddMode {
    case menu, web, color, note
}

func boardHex(_ color: Color) -> String {
    let ui = UIColor(color)
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    ui.getRed(&r, green: &g, blue: &b, alpha: &a)
    func part(_ v: CGFloat) -> String { return String(format: "%02x", Int((max(0, min(1, v)) * 255).rounded())) }
    return "#" + part(r) + part(g) + part(b)
}

struct BoardAddSheet: View {
    @Environment(\.liTheme) private var theme
    let model: BoardsModel
    let boardId: String
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var mode: AddMode = .menu
    @State private var picks: [PhotosPickerItem] = []
    @State private var camera = false
    @State private var busy = false
    @State private var status: String? = nil
    @State private var web = ""
    @State private var hex = ""
    @State private var swatch = Color(hex: "#7c5cff")
    @State private var colorNote = ""
    @State private var text = ""
    @State private var link = ""

    var body: some View {
        LXSheet(title: title, subtitle: subtitle) {
            VStack(alignment: .leading, spacing: 14) {
                switch mode {
                case .menu: menu
                case .web: webForm
                case .color: colorForm
                case .note: noteForm
                }
                if let s = status {
                    HStack(spacing: 10) {
                        ProgressView().tint(theme.ink2)
                        Text(s).liType(.sub).foregroundColor(theme.ink2)
                    }
                }
            }
        } footer: {
            if mode != .menu {
                HStack(spacing: 10) {
                    LXWideButton(title: "Back") { mode = .menu }
                    LXPrimaryButton(title: "Add", busy: busy, disabled: !canAdd) { commit() }
                }
            }
        }
        .fullScreenCover(isPresented: $camera) {
            BoardCameraPicker(onImage: { data in
                camera = false
                add(data, source: .camera, link: nil)
            }, onCancel: { camera = false })
            .ignoresSafeArea()
        }
        .onChange(of: picks) { _, now in
            if !now.isEmpty { loadPicks(now) }
        }
        .onChange(of: swatch) { _, c in hex = boardHex(c) }
    }

    private var title: String {
        switch mode {
        case .menu: return "Add"
        case .web: return "From the web"
        case .color: return "A color"
        case .note: return "A note"
        }
    }

    private var subtitle: String? {
        switch mode {
        case .menu: return "Anything that belongs in this world."
        case .web: return "Paste the address of an image."
        case .color: return "Pick one, or type a hex."
        case .note: return "Words, a link, or both."
        }
    }

    private var canAdd: Bool {
        switch mode {
        case .menu: return false
        case .web: return !web.trimmingCharacters(in: .whitespaces).isEmpty
        case .color: return ThemeBuild.normalizeHex(hex) != nil
        case .note: return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !link.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }

    @ViewBuilder
    private var menu: some View {
        VStack(spacing: 10) {
            if BoardCameraPicker.available {
                Button { camera = true } label: { LXRow(title: "Camera", sub: "Take a photo") }
                    .buttonStyle(LIPressStyle())
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(theme.tile))
            }
            PhotosPicker(selection: $picks, maxSelectionCount: 12, matching: .images) {
                LXRow(title: "Photos", sub: "Choose from your library")
            }
            .buttonStyle(LIPressStyle())
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(theme.tile))
            Button { pasteImage() } label: { LXRow(title: "Paste", sub: "An image on the clipboard") }
                .buttonStyle(LIPressStyle())
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(theme.tile))
            Button { mode = .web } label: { LXRow(title: "Web address", sub: "An image from a page or a link") }
                .buttonStyle(LIPressStyle())
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(theme.tile))
            Button { mode = .color } label: { LXRow(title: "Color", sub: "A swatch for the palette") }
                .buttonStyle(LIPressStyle())
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(theme.tile))
            Button { mode = .note } label: { LXRow(title: "Note", sub: "A line to remember, or a link") }
                .buttonStyle(LIPressStyle())
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(theme.tile))
        }
        .disabled(busy)
    }

    private var webForm: some View {
        LXField(label: "Image address", text: $web, placeholder: "https://", hint: "Pages with a main image work too.", keyboard: .URL, capitalization: .never)
    }

    private var colorForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                ColorPicker("Color", selection: $swatch, supportsOpacity: false).labelsHidden().scaleEffect(1.3).frame(width: 52, height: 52)
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(ThemeBuild.normalizeHex(hex).map { Color(hex: $0) } ?? theme.surface2)
                    .frame(height: 52)
            }
            LXField(label: "Hex", text: $hex, placeholder: "#7c5cff", capitalization: .never)
            LXField(label: "Name (optional)", text: $colorNote, placeholder: "Bone", hint: nil)
        }
    }

    private var noteForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            LXField(label: "Note", text: $text, placeholder: "What this world feels like", lines: 6)
            LXField(label: "Link (optional)", text: $link, placeholder: "example.com", keyboard: .URL, capitalization: .never)
        }
    }

    private func commit() {
        switch mode {
        case .menu: return
        case .web:
            let address = web
            run("Fetching the image") {
                guard let clean = BoardsCore.cleanLink(address) else { throw MealsFailure("That does not look like an address.") }
                let data = try await model.fetchWebImage(clean)
                _ = try await model.addImage(boardId: boardId, raw: data, source: .web, sourceUrl: clean)
            }
        case .color:
            let h = hex, n = colorNote
            run(nil) { _ = try await model.addColor(boardId: boardId, color: h, note: n) }
        case .note:
            let t = text, l = link
            run(nil) { _ = try await model.addNote(boardId: boardId, text: t, link: l) }
        }
    }

    private func run(_ label: String?, _ work: @escaping () async throws -> Void) {
        if busy { return }
        busy = true
        status = label
        Task {
            do {
                try await work()
                LIHaptics.celebrate()
                onClose()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
                busy = false
                status = nil
            }
        }
    }

    private func add(_ data: Data, source: BoardItemSource, link: String?) {
        run("Adding") { _ = try await model.addImage(boardId: boardId, raw: data, source: source, sourceUrl: link) }
    }

    private func pasteImage() {
        if let image = UIPasteboard.general.image, let data = image.jpegData(compressionQuality: 0.95) {
            add(data, source: .screenshot, link: nil)
        } else {
            LIHaptics.error()
            onToast("No image on the clipboard.")
        }
    }

    private func loadPicks(_ chosen: [PhotosPickerItem]) {
        if busy { return }
        busy = true
        status = chosen.count > 1 ? "Adding \(chosen.count) photos" : "Adding"
        Task {
            var added = 0
            var failed: Error? = nil
            for p in chosen {
                do {
                    if let data = try await p.loadTransferable(type: Data.self) {
                        _ = try await model.addImage(boardId: boardId, raw: data, source: .upload)
                        added += 1
                    }
                } catch {
                    failed = error
                }
            }
            picks = []
            if added > 0 {
                LIHaptics.celebrate()
                if let f = failed { onToast("Added \(added). " + BoardsModel.describe(f)) }
                onClose()
            } else {
                LIHaptics.error()
                onToast(failed.map { BoardsModel.describe($0) } ?? "Could not read that photo.")
                busy = false
                status = nil
            }
        }
    }
}

// MARK: one piece

struct BoardItemSheet: View {
    @Environment(\.liTheme) private var theme
    let model: BoardsModel
    let itemId: String
    let onClose: () -> Void
    let onToast: (String) -> Void
    let onLook: (String) -> Void

    @State private var note = ""
    @State private var link = ""
    @State private var hex = ""
    @State private var loaded = false
    @State private var pixels: BoardPixels? = nil
    @State private var picked: String? = nil
    @State private var pin: CGPoint? = nil
    @State private var busy = false
    @State private var confirm = false

    private var item: BoardItem? { return model.items.first { $0.id == itemId } }

    var body: some View {
        Group {
            if let item = item {
                sheet(item)
            } else {
                LXSheet(title: "Gone") { EmptyView() }
            }
        }
        .onAppear {
            guard !loaded, let item = item else { return }
            loaded = true
            note = item.note ?? ""
            link = item.sourceUrl ?? ""
            hex = item.color ?? ""
        }
        .task(id: item?.imageUrl) {
            if let u = item?.imageUrl { pixels = await BoardPixels.load(u) }
        }
    }

    private func siblings(_ item: BoardItem) -> [String] {
        return model.itemsOf(item.boardId).map { $0.id }
    }

    private func sheet(_ item: BoardItem) -> some View {
        let ids = siblings(item)
        let index = ids.firstIndex(of: item.id) ?? 0
        let isCover = model.boards.first { $0.id == item.boardId }.map { BoardsCore.coverOf($0.coverItemId, model.itemsOf($0.id))?.id == item.id } ?? false
        return LXSheet(title: heading(item), subtitle: subtitleFor(item)) {
            VStack(alignment: .leading, spacing: 18) {
                switch item.kind {
                case .image: imageBlock(item)
                case .color: colorBlock(item)
                case .note: EmptyView()
                }

                if item.kind == .note {
                    LXField(label: "Note", text: $note, placeholder: "What this world feels like", lines: 8)
                } else {
                    LXField(label: item.kind == .image ? "Caption" : "Name", text: $note, placeholder: item.kind == .image ? "Optional" : "Bone", lines: 3)
                }
                if item.kind != .color {
                    LXField(label: "Link", text: $link, placeholder: "example.com", hint: item.source == .web ? "Where this came from." : nil, keyboard: .URL, capitalization: .never)
                }
                if let host = BoardsCore.linkHost(item.sourceUrl), let url = URL(string: item.sourceUrl ?? "") {
                    Link(destination: url) {
                        HStack(spacing: 6) {
                            Text("Open \(host)").liType(.sub)
                            Image(systemName: "arrow.up.right").font(.system(size: 11))
                        }
                        .foregroundColor(theme.accent)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        LXWideButton(title: "Earlier", disabled: index == 0) { move(item, ids, index - 1) }
                        LXWideButton(title: "Later", disabled: index >= ids.count - 1) { move(item, ids, index + 1) }
                    }
                    if item.kind == .image {
                        LXWideButton(title: isCover ? "This is the cover" : "Make cover", disabled: isCover) { makeCover(item) }
                        LXWideButton(title: "Set the look from this image") { onLook(item.id) }
                    }
                    LXDangerButton(title: confirm ? "Tap again to delete" : "Delete") {
                        if !confirm {
                            confirm = true
                            return
                        }
                        remove(item)
                    }
                }
            }
        } footer: {
            LXPrimaryButton(title: "Save", busy: busy) { save(item) }
        }
    }

    private func heading(_ item: BoardItem) -> String {
        switch item.kind {
        case .image: return "Image"
        case .color: return "Color"
        case .note: return "Note"
        }
    }

    private func subtitleFor(_ item: BoardItem) -> String? {
        switch item.kind {
        case .image: return pixels != nil ? "Tap the image to take a color from it." : nil
        case .color: return item.color
        case .note: return nil
        }
    }

    @ViewBuilder
    private func imageBlock(_ item: BoardItem) -> some View {
        let ratio = CGFloat(BoardsCore.clampAspect(item.aspect))
        VStack(alignment: .leading, spacing: 14) {
            BoardImage(url: item.imageUrl, tone: item.palette?.first)
                .aspectRatio(ratio, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay(GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        Color.clear.contentShape(Rectangle())
                            .gesture(SpatialTapGesture().onEnded { tap in sample(tap.location, geo.size) })
                        if let p = pin {
                            Circle()
                                .strokeBorder(Color.white, lineWidth: 3)
                                .background(Circle().fill(picked.map { Color(hex: $0) } ?? Color.clear))
                                .frame(width: 30, height: 30)
                                .shadow(color: Color.black.opacity(0.4), radius: 4)
                                .position(p)
                                .allowsHitTesting(false)
                        }
                    }
                })
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            if let c = picked {
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(hex: c)).frame(width: 44, height: 44)
                    Text(c.replacingOccurrences(of: "#", with: "")).liType(.body).foregroundColor(theme.ink)
                    Spacer()
                    LISecondaryButton("Keep color") { keep(c) }
                }
            }
            if let p = item.palette, !p.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Palette. Tap one to keep it.").liType(.sub).foregroundColor(theme.ink2)
                    HStack(spacing: 8) {
                        ForEach(p, id: \.self) { c in
                            Button { keep(c) } label: {
                                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(hex: c)).frame(height: 44)
                            }
                            .buttonStyle(LIPressStyle())
                            .accessibilityLabel("Keep \(c)")
                        }
                    }
                }
            }
        }
    }

    private func colorBlock(_ item: BoardItem) -> some View {
        let c = ThemeBuild.normalizeHex(hex) ?? item.color ?? "#808080"
        return VStack(alignment: .leading, spacing: 14) {
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Color(hex: c)).frame(height: 140)
                .overlay(alignment: .bottomLeading) {
                    Text(c.replacingOccurrences(of: "#", with: "")).liType(.h2).foregroundColor(boardInk(c)).padding(16)
                }
            LXField(label: "Hex", text: $hex, placeholder: "#7c5cff", capitalization: .never)
        }
    }

    private func sample(_ at: CGPoint, _ size: CGSize) {
        guard let px = pixels, size.width > 0, size.height > 0 else { return }
        let fx = Double(at.x / size.width), fy = Double(at.y / size.height)
        // The image is filled into a box of its own shape, so the box and the pixels line up.
        let x = max(0, min(Double(px.width - 1), fx * Double(px.width)))
        let y = max(0, min(Double(px.height - 1), fy * Double(px.height)))
        if let c = BoardsCore.colorAt(px.data, width: px.width, height: px.height, x: x, y: y) {
            picked = c
            pin = at
            LIHaptics.tap()
        }
    }

    private func keep(_ color: String) {
        guard let item = item else { return }
        Task {
            do {
                _ = try await model.addColor(boardId: item.boardId, color: color, note: nil)
                LIHaptics.celebrate()
                onToast("Color kept on the board")
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
            }
        }
    }

    private func move(_ item: BoardItem, _ ids: [String], _ to: Int) {
        let next = BoardsCore.moveId(ids, item.id, to: to)
        Task {
            do {
                try await model.reorderItems(boardId: item.boardId, next)
                LIHaptics.tap()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
            }
        }
    }

    private func makeCover(_ item: BoardItem) {
        Task {
            do {
                try await model.saveBoard(item.boardId, coverItemId: .some(item.id))
                LIHaptics.celebrate()
                onToast("Cover set")
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
            }
        }
    }

    private func save(_ item: BoardItem) {
        if busy { return }
        busy = true
        let n = note, l = link, h = hex
        Task {
            do {
                if item.kind == .color {
                    try await model.saveItem(item.id, note: .some(n), color: h)
                } else {
                    try await model.saveItem(item.id, note: .some(n), link: .some(l))
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

    private func remove(_ item: BoardItem) {
        if busy { return }
        busy = true
        Task {
            do {
                try await model.deleteItem(item)
                onToast("Removed")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
                busy = false
            }
        }
    }
}

// MARK: the look

/// Choose which color does what, see the app in it, and wear it. The same moves as the web studio.
struct LookStudio: View {
    @Environment(\.liTheme) private var theme
    @Environment(AppStore.self) private var appStore
    let model: BoardsModel
    let boardId: String
    let source: LookSource
    let onClose: () -> Void
    let onToast: (String) -> Void

    @State private var base: ThemeBase = .dark
    @State private var roles = RoleChoice()
    @State private var from: String? = nil
    @State private var ready = false
    @State private var busy = false

    private var board: Board? { return model.boards.first { $0.id == boardId } }
    private var images: [BoardItem] { return model.itemsOf(boardId).filter { $0.kind == .image } }

    private var colors: [String] {
        let all = model.itemsOf(boardId)
        if let id = from, let item = all.first(where: { $0.id == id }) {
            return BoardsCore.dedupeColors(item.palette ?? [], 0.02)
        }
        return BoardsCore.boardPalette(all, max: 14)
    }

    private var built: BuiltTheme { return ThemeBuild.build(base, BoardsCore.rolesToPalette(roles)) }

    var body: some View {
        let b = built
        let shifts = BoardsCore.roleShifts(roles, b).filter { $0.noticeable }
        let fails = ThemeBuild.audit(b).filter { !$0.pass }
        return LXSheet(title: "The look", subtitle: "Pick what each color does.") {
            VStack(alignment: .leading, spacing: 22) {
                preview(b)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Colors from").liType(.sub).foregroundColor(theme.ink2)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            sourceChip(title: "Whole board", on: from == nil) { choose(nil) }
                            ForEach(Array(images.enumerated()), id: \.element.id) { i, img in
                                Button { choose(img.id) } label: {
                                    BoardImage(url: img.imageUrl, tone: img.palette?.first)
                                        .frame(width: 52, height: 52)
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(from == img.id ? theme.accent : Color.clear, lineWidth: 2))
                                }
                                .buttonStyle(LIPressStyle())
                                .accessibilityLabel("Image \(i + 1)")
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Base").liType(.sub).foregroundColor(theme.ink2)
                    LISegmentedControl(options: ThemeBase.allCases.map { (value: $0, title: ThemeBuild.baseName($0)) }, selection: $base)
                    Text(ThemeBuild.baseBlurb(base)).liType(.caption).foregroundColor(theme.ink2)
                }

                ForEach(ThemeRole.allCases, id: \.self) { role in
                    roleRow(role)
                }

                if !shifts.isEmpty || !fails.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(shifts, id: \.role) { s in
                            HStack(alignment: .top, spacing: 10) {
                                HStack(spacing: 0) {
                                    Rectangle().fill(Color(hex: s.asked))
                                    Rectangle().fill(Color(hex: s.used))
                                }
                                .frame(width: 34, height: 20)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                Text("\(s.role.label): \(s.why)").liType(.caption).foregroundColor(theme.ink2)
                            }
                        }
                        ForEach(fails, id: \.label) { f in
                            Text("\(f.label) is hard to read here.").liType(.caption).foregroundColor(theme.danger)
                        }
                    }
                }

                if appStore.themeRow?.palette != nil {
                    LXWideButton(title: "Back to \(ThemeBuild.baseName(base))") { reset() }
                }
            }
        } footer: {
            LXPrimaryButton(title: "Wear this look", busy: busy, disabled: colors.isEmpty) { apply() }
        }
        .onAppear {
            guard !ready else { return }
            ready = true
            base = appStore.themeRow?.base ?? .dark
            from = source.imageId
            if appStore.themeRow?.boardId == boardId, let p = appStore.themeRow?.palette, source.imageId == nil {
                roles = BoardsCore.paletteToRoles(p)
            } else {
                roles = BoardsCore.autoRoles(colors, base: base)
            }
        }
        .onChange(of: base) { _, _ in
            // The first guess depends on the base. Only redo it while nothing has been chosen by hand.
        }
    }

    private func choose(_ id: String?) {
        from = id
        roles = BoardsCore.autoRoles(colors, base: base)
        LIHaptics.tap()
    }

    private func sourceChip(title: String, on: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).liType(.sub)
                .foregroundColor(on ? theme.accentInk : theme.ink)
                .padding(.horizontal, 14)
                .frame(height: 52)
                .background(Capsule().fill(on ? AnyShapeStyle(theme.gradient) : AnyShapeStyle(theme.tile)))
        }
        .buttonStyle(LIPressStyle())
    }

    private func roleRow(_ role: ThemeRole) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(role.label).liType(.body).foregroundColor(theme.ink)
                Spacer()
                if roles[role] != nil {
                    Button("Let the base decide") {
                        roles[role] = nil
                        LIHaptics.tap()
                    }
                    .liType(.caption)
                    .foregroundColor(theme.ink2)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(colors, id: \.self) { c in
                        Button {
                            roles[role] = c
                            LIHaptics.tap()
                        } label: {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Color(hex: c))
                                .frame(width: 44, height: 44)
                                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(roles[role] == c ? theme.accent : theme.tileLine, lineWidth: roles[role] == c ? 3 : 1))
                        }
                        .buttonStyle(LIPressStyle())
                        .accessibilityLabel("\(role.label) \(c)")
                    }
                }
                .padding(2)
            }
        }
    }

    /// A small Today in the chosen look.
    private func preview(_ b: BuiltTheme) -> some View {
        let t = LITheme(built: b)
        return ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(t.bg)
            VStack(alignment: .leading, spacing: 12) {
                Text("Today").liType(.label).foregroundColor(t.ink2)
                Text("Locked in").liType(.title).foregroundColor(t.ink)
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(t.surface2)
                    .frame(height: 54)
                    .overlay(alignment: .leading) {
                        HStack {
                            Text("Morning").liType(.body).foregroundColor(t.ink)
                            Spacer()
                            Text("3 of 5").liType(.body).foregroundColor(t.ink2)
                        }
                        .padding(.horizontal, 16)
                    }
                Capsule().fill(t.gradient).frame(height: 44)
                    .overlay(Text("Check in").liType(.body).foregroundColor(t.accentInk))
            }
            .padding(18)
        }
        .animation(.easeOut(duration: 0.2), value: b)
    }

    private func apply() {
        if busy { return }
        busy = true
        let palette = BoardsCore.rolesToPalette(roles)
        let name = board?.name
        Task {
            do {
                try await appStore.activateTheme(base: base, palette: palette, boardId: boardId, name: name)
                LIHaptics.celebrate()
                onToast("The app now wears \(name ?? "this board")")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
                busy = false
            }
        }
    }

    private func reset() {
        if busy { return }
        busy = true
        Task {
            do {
                try await appStore.resetThemePalette()
                LIHaptics.tap()
                onToast("Back to \(ThemeBuild.baseName(base))")
                onClose()
            } catch {
                LIHaptics.error()
                onToast(BoardsModel.describe(error))
                busy = false
            }
        }
    }
}
