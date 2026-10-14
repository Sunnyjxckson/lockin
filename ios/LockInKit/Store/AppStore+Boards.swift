import Foundation
import Observation
import UIKit

// Boards: reads and writes for mood boards, photo upload through /api/storage, and web images through /api/boards/image.
// A port of src/features/boards/data.ts and images.ts. Every write goes to the same tables the web uses.

public struct PreparedImage {
    public var data: Data
    /// Width over height.
    public var aspect: Double
    public var palette: [String]
}

public enum BoardImagePrep {
    /// Longest side of a stored board image. Enough for a phone at full width, small enough to keep dozens.
    public static let maxSide: CGFloat = 1280
    static let quality: CGFloat = 0.8
    /// The palette is read from a copy this size. More pixels do not change the answer.
    static let sample: CGFloat = 72

    /// Scale an image down, turn it into a JPEG and pull its palette.
    public static func prepare(_ raw: Data) throws -> PreparedImage {
        guard let image = UIImage(data: raw), image.size.width > 0, image.size.height > 0 else {
            throw MealsFailure("Could not read that image. Try a JPEG or PNG.")
        }
        let w0 = image.size.width
        let h0 = image.size.height
        let longest = max(w0, h0)
        let scale = min(1, maxSide / longest)
        let size = CGSize(width: max(1, (w0 * scale).rounded()), height: max(1, (h0 * scale).rounded()))

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        // JPEG has no transparency. Paper white behind a cut out, the way it would sit on a page.
        let jpeg = renderer.jpegData(withCompressionQuality: quality) { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }

        let sampleScale = min(1, sample / longest)
        let sw = max(1, Int((w0 * sampleScale).rounded()))
        let sh = max(1, Int((h0 * sampleScale).rounded()))
        let small = UIGraphicsImageRenderer(size: CGSize(width: sw, height: sh), format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: sw, height: sh))
            image.draw(in: CGRect(x: 0, y: 0, width: sw, height: sh))
        }
        var pixels = [UInt8](repeating: 255, count: sw * sh * 4)
        if let cg = small.cgImage {
            let info = CGImageAlphaInfo.premultipliedLast.rawValue
            pixels.withUnsafeMutableBytes { buffer in
                if let ctx = CGContext(data: buffer.baseAddress, width: sw, height: sh, bitsPerComponent: 8, bytesPerRow: sw * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info) {
                    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: sw, height: sh))
                }
            }
        }
        let palette = BoardsCore.extractPalette(pixels)
        return PreparedImage(data: jpeg, aspect: Double(size.width / size.height), palette: palette)
    }
}

public struct BoardSummary {
    public var board: Board
    public var items: [BoardItem]
    public var cover: BoardItem?
    public var palette: [String]
    public var images: Int
}

@Observable
@MainActor
public final class BoardsModel {
    @ObservationIgnored public let store: AppStore
    @ObservationIgnored private var measuring = Set<String>()

    public private(set) var boards: [Board] = []
    public private(set) var items: [BoardItem] = []
    public private(set) var loading = true
    public private(set) var failure: String? = nil

    public init(store: AppStore) {
        self.store = store
    }

    private var db: DBClient { return store.db }

    // MARK: reading

    public func load() async {
        if !store.hasData { await store.reload() }
        await refresh()
        loading = false
    }

    public func refresh() async {
        do {
            async let b = db.list(Board.self, Query(orderBy: "sort_order"))
            async let i = db.list(BoardItem.self, Query(orderBy: "sort_order"))
            boards = try await b
            items = try await i
            failure = nil
        } catch {
            failure = BoardsModel.describe(error)
        }
    }

    public static func describe(_ error: Error) -> String {
        if let api = error as? APIError { return api.isOffline ? "You look offline. Try again." : (api.errorDescription ?? "Could not save that. Try again.") }
        if let le = error as? LocalizedError, let d = le.errorDescription, !d.isEmpty { return d }
        return "Could not save that. Try again."
    }

    public func itemsOf(_ boardId: String) -> [BoardItem] {
        return items.filter { $0.boardId == boardId }
    }

    public var summaries: [BoardSummary] {
        return boards.map { board in
            let mine = itemsOf(board.id)
            return BoardSummary(board: board, items: mine, cover: BoardsCore.coverOf(board.coverItemId, mine), palette: BoardsCore.boardPalette(mine), images: mine.filter { $0.kind == .image }.count)
        }
    }

    public static func countLabel(_ n: Int) -> String {
        return n == 1 ? "1 piece" : "\(n) pieces"
    }

    // MARK: boards

    private func nextOrder(_ orders: [Int]) -> Int {
        return (orders.max() ?? -1) + 1
    }

    @discardableResult
    public func createBoard(name: String, kind: BoardKind) async throws -> Board {
        let all = try await db.list(Board.self)
        let made = try await db.insert(Board.self, [
            "name": .string(BoardsCore.cleanBoardName(name, kind)),
            "kind": .string(kind.rawValue),
            "cover_item_id": .null,
            "sort_order": .int(nextOrder(all.map { $0.sortOrder })),
        ])
        await refresh()
        return made
    }

    public func saveBoard(_ id: String, name: String? = nil, kind: BoardKind? = nil, coverItemId: String?? = nil) async throws {
        guard let board = try await db.get(Board.self, id: id) else { return }
        var patch: JSONObject = [:]
        let nextKind = kind ?? board.kind
        if let k = kind { patch["kind"] = .string(k.rawValue) }
        if let n = name { patch["name"] = .string(BoardsCore.cleanBoardName(n, nextKind)) }
        if let cover = coverItemId { patch["cover_item_id"] = JSON.str(cover) }
        if patch.isEmpty { return }
        try await db.update(Board.self, id: id, patch: patch)
        await refresh()
    }

    public func reorderBoards(_ idsInOrder: [String]) async throws {
        let all = try await db.list(Board.self)
        let patches = BoardsCore.orderPatches(idsInOrder, current: all.map { (id: $0.id, sortOrder: $0.sortOrder) })
        for p in patches { try await db.update(Board.self, id: p.id, patch: ["sort_order": .int(p.sortOrder)]) }
        await refresh()
    }

    public func deleteBoard(_ id: String) async throws {
        let mine = try await db.list(BoardItem.self, Query(eq: ["board_id": .string(id)]))
        for item in mine {
            if let url = item.imageUrl { await removePhoto(url) }
        }
        try await db.removeWhere(BoardItem.self, eq: ["board_id": .string(id)])
        try await db.remove(Board.self, id: id)
        await refresh()
    }

    // MARK: pieces

    @discardableResult
    private func insertItem(_ boardId: String, kind: BoardItemKind, fields: JSONObject) async throws -> BoardItem {
        let mine = try await db.list(BoardItem.self, Query(eq: ["board_id": .string(boardId)]))
        var row: JSONObject = [
            "board_id": .string(boardId),
            "kind": .string(kind.rawValue),
            "image_url": .null,
            "note": .null,
            "color": .null,
            "palette": .null,
            "source": .null,
            "source_url": .null,
            "aspect": .null,
            "sort_order": .int(nextOrder(mine.map { $0.sortOrder })),
        ]
        for (k, v) in fields { row[k] = v }
        let made = try await db.insert(BoardItem.self, row)
        await refresh()
        return made
    }

    static func roundAspect(_ a: Double) -> Double? {
        return a.isFinite && a > 0 ? (a * 1000).rounded() / 1000 : nil
    }

    /// Scale the image down, pull its palette, store it and put it on the board. Nothing is left behind if it fails.
    @discardableResult
    public func addImage(boardId: String, raw: Data, source: BoardItemSource, sourceUrl: String? = nil) async throws -> BoardItem {
        let prepared = try BoardImagePrep.prepare(raw)
        let ref = try await upload(prepared.data, folder: "boards")
        do {
            return try await insertItem(boardId, kind: .image, fields: [
                "image_url": .string(ref),
                "palette": .array(prepared.palette.map { JSON.string($0) }),
                "source": .string(source.rawValue),
                "source_url": JSON.str(sourceUrl),
                "aspect": JSON.num(BoardsModel.roundAspect(prepared.aspect)),
            ])
        } catch {
            await removePhoto(ref)
            throw error
        }
    }

    /// Keep a swatch on the board. Returns nil when the color is not a hex color.
    @discardableResult
    public func addColor(boardId: String, color: String, note: String? = nil) async throws -> BoardItem? {
        guard let hex = ThemeBuild.normalizeHex(color) else { return nil }
        let trimmed = (note ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return try await insertItem(boardId, kind: .color, fields: [
            "color": .string(hex),
            "note": trimmed.isEmpty ? JSON.null : JSON.string(trimmed),
        ])
    }

    @discardableResult
    public func addNote(boardId: String, text: String, link: String? = nil) async throws -> BoardItem? {
        let body = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(600))
        let url: String? = (link ?? "").isEmpty ? nil : BoardsCore.cleanLink(link ?? "")
        if body.isEmpty && url == nil { return nil }
        return try await insertItem(boardId, kind: .note, fields: [
            "note": body.isEmpty ? JSON.null : JSON.string(body),
            "source_url": JSON.str(url),
        ])
    }

    public func saveItem(_ id: String, note: String?? = nil, link: String?? = nil, color: String? = nil) async throws {
        var patch: JSONObject = [:]
        if let n = note {
            let t = String((n ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(600))
            patch["note"] = t.isEmpty ? JSON.null : JSON.string(t)
        }
        if let l = link {
            if let text = l, !text.isEmpty { patch["source_url"] = JSON.str(BoardsCore.cleanLink(text)) } else { patch["source_url"] = .null }
        }
        if let c = color, let hex = ThemeBuild.normalizeHex(c) { patch["color"] = .string(hex) }
        if patch.isEmpty { return }
        try await db.update(BoardItem.self, id: id, patch: patch)
        await refresh()
    }

    public func deleteItem(_ item: BoardItem) async throws {
        try await db.remove(BoardItem.self, id: item.id)
        if let url = item.imageUrl { await removePhoto(url) }
        if let board = try await db.get(Board.self, id: item.boardId), board.coverItemId == item.id {
            try await db.update(Board.self, id: board.id, patch: ["cover_item_id": .null])
        }
        await refresh()
    }

    public func reorderItems(boardId: String, _ idsInOrder: [String]) async throws {
        let mine = try await db.list(BoardItem.self, Query(eq: ["board_id": .string(boardId)]))
        let patches = BoardsCore.orderPatches(idsInOrder, current: mine.map { (id: $0.id, sortOrder: $0.sortOrder) })
        for p in patches { try await db.update(BoardItem.self, id: p.id, patch: ["sort_order": .int(p.sortOrder)]) }
        await refresh()
    }

    /// Save the shape of an image that was stored without one, so the collage stops jumping.
    public func rememberAspect(_ item: BoardItem, aspect: Double) {
        guard let rounded = BoardsModel.roundAspect(aspect), item.aspect != rounded, !measuring.contains(item.id) else { return }
        measuring.insert(item.id)
        let id = item.id
        if let i = items.firstIndex(where: { $0.id == id }) { items[i].aspect = rounded }
        Task { @MainActor in
            _ = try? await self.db.update(BoardItem.self, id: id, patch: ["aspect": .number(rounded)])
            self.measuring.remove(id)
        }
    }

    // MARK: photos and the web

    /// Upload a JPEG to /api/storage. Returns the public address.
    public func upload(_ data: Data, folder: String) async throws -> String {
        let api = db.api
        guard let url = URL(string: api.baseURL.absoluteString + "/api/storage") else { throw APIError.invalidURL }
        let boundary = "lockin-" + UUID().uuidString
        var body = Data()
        func add(_ s: String) { body.append(Data(s.utf8)) }
        add("--\(boundary)\r\nContent-Disposition: form-data; name=\"folder\"\r\n\r\n\(folder)\r\n")
        add("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
        body.append(data)
        add("\r\n--\(boundary)--\r\n")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "content-type")
        request.timeoutInterval = 60
        let out: Data
        let status: Int
        do {
            let (d, r) = try await api.session.data(for: request)
            out = d
            status = (r as? HTTPURLResponse)?.statusCode ?? 0
        } catch {
            throw APIError.offline
        }
        if status == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(JSON.self, from: out)).flatMap { json -> String? in
                if case .object(let o) = json, case .string(let m)? = o["error"] { return m }
                return nil
            }
            throw MealsFailure(message ?? "Could not store the photo.")
        }
        guard let json = try? JSONDecoder().decode(JSON.self, from: out), case .object(let o) = json, case .string(let ref)? = o["url"] else {
            throw APIError.badResponse
        }
        return ref
    }

    /// Delete a stored photo. Failing is fine: the row is already gone.
    public func removePhoto(_ url: String) async {
        guard url.hasPrefix("http") else { return }
        guard let body = try? JSONEncoder().encode(JSON.object(["url": .string(url)])) else { return }
        _ = try? await db.api.send(path: "/api/storage", method: "DELETE", body: body)
    }

    /// Ask the server for an image on the web. The message of the error can be shown as it is.
    public func fetchWebImage(_ address: String) async throws -> Data {
        guard let body = try? JSONEncoder().encode(JSON.object(["url": .string(address)])) else { throw APIError.badResponse }
        var out = Data()
        var status = 0
        do {
            let reply = try await db.api.send(path: "/api/boards/image", method: "POST", body: body)
            out = reply.0
            status = reply.1
        } catch {
            throw MealsFailure("Could not reach the app to fetch that. Check the connection.")
        }
        if !(200..<300).contains(status) {
            var message = "Could not fetch that image."
            if let json = try? JSONDecoder().decode(JSON.self, from: out), case .object(let o) = json, case .string(let m)? = o["error"] { message = m }
            throw MealsFailure(message)
        }
        return out
    }
}
