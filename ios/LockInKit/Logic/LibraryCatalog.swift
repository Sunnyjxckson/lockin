import Foundation

// The quotes on disk. The app bundles the same JSON the web app ships (src/data/quotes). The index is small and read
// at once; each writer's file is decoded the first time something needs it and kept; the passage file for a writer
// is read when Go deeper is first opened. Port of src/features/library/data.ts.

public struct WriterData {
    public var info: WriterInfo
    public var works: [WorkInfo]
    public var quotes: [LibQuote]
}

public enum LibraryLoadError: Error, LocalizedError {
    case missing(String)
    case unreadable(String)
    case unknownWriter(String)

    public var errorDescription: String? {
        switch self {
        case .missing, .unreadable: return "Could not load the quotes."
        case .unknownWriter(let s): return "No writer called \(s)."
        }
    }
}

public final class LibraryCatalog: @unchecked Sendable {
    public static let shared = LibraryCatalog()

    /// Where the JSON lives. The app bundle.
    public var bundle: Bundle = Bundle.main

    private let lock = NSLock()
    private var indexCache: QuoteIndex? = nil
    private var writerCache: [String: WriterData] = [:]
    private var contextCache: [String: [String: String]] = [:]
    private var poolCache: ShortPool? = nil

    public init() {}

    private func readData(_ name: String) throws -> Data {
        guard let url = bundle.url(forResource: "lib-" + name, withExtension: "json") else { throw LibraryLoadError.missing(name) }
        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else { throw LibraryLoadError.unreadable(name) }
        return data
    }

    public func index() throws -> QuoteIndex {
        lock.lock()
        let have = indexCache
        lock.unlock()
        if let h = have { return h }
        let data = try readData("index")
        guard let made = try? JSONDecoder().decode(QuoteIndex.self, from: data) else { throw LibraryLoadError.unreadable("index") }
        lock.lock()
        indexCache = made
        lock.unlock()
        return made
    }

    public func slugs() -> [String] {
        return ((try? index())?.writers ?? []).map { $0.slug }
    }

    /// One writer's quotes, in source order. Decoding runs off the main thread.
    public func writer(_ slug: String) async throws -> WriterData {
        lock.lock()
        let have = writerCache[slug]
        lock.unlock()
        if let h = have { return h }
        guard slugs().contains(slug) else { throw LibraryLoadError.unknownWriter(slug) }
        let task = Task.detached(priority: .userInitiated) { [self] () throws -> WriterData in
            let data = try self.readData(slug)
            guard let file = try? JSONDecoder().decode(WriterFile.self, from: data) else { throw LibraryLoadError.unreadable(slug) }
            var quotes = file.quotes
            for i in quotes.indices { quotes[i].writer = slug }
            return WriterData(info: file.writer, works: file.works, quotes: quotes)
        }
        let made = try await task.value
        lock.lock()
        writerCache[slug] = made
        lock.unlock()
        return made
    }

    public func writers(_ slugs: [String]) async throws -> [WriterData] {
        var out: [WriterData] = []
        for s in slugs { out.append(try await writer(s)) }
        return out
    }

    /// The passage around each quote of a writer, by quote id.
    public func context(_ slug: String) async throws -> [String: String] {
        lock.lock()
        let have = contextCache[slug]
        lock.unlock()
        if let h = have { return h }
        let task = Task.detached(priority: .userInitiated) { [self] () throws -> [String: String] in
            let data = try self.readData(slug + ".context")
            guard let map = try? JSONDecoder().decode([String: String].self, from: data) else { throw LibraryLoadError.unreadable(slug) }
            return map
        }
        let made = try await task.value
        lock.lock()
        contextCache[slug] = made
        lock.unlock()
        return made
    }

    /// The short quotes drops are drawn from.
    public func shortPool() throws -> ShortPool {
        lock.lock()
        let have = poolCache
        lock.unlock()
        if let h = have { return h }
        let data = try readData("quotes-short")
        guard let made = try? JSONDecoder().decode(ShortPool.self, from: data) else { throw LibraryLoadError.unreadable("quotes-short") }
        lock.lock()
        poolCache = made
        lock.unlock()
        return made
    }

    /// Find a quote by id. `hint` is the writer when known.
    public func find(_ id: String, hint: String? = nil) async -> LibQuote? {
        let all = slugs()
        var order: [String] = []
        if let h = hint { order.append(h) }
        for s in all where id.hasPrefix(s + "-") || id.hasPrefix(s + ":") { order.append(s) }
        order.append(contentsOf: all)
        var tried = Set<String>()
        for s in order {
            if tried.contains(s) || !all.contains(s) { continue }
            tried.insert(s)
            if let data = try? await writer(s), let hit = data.quotes.first(where: { $0.id == id }) { return hit }
        }
        return nil
    }
}

/// A set of loaded writers with the lookups the screens need.
public final class Library {
    public let index: QuoteIndex
    public let writers: [WriterData]
    /// Every loaded quote: writers as the index lists them, each in source order.
    public let quotes: [LibQuote]
    public let byId: [String: LibQuote]
    private var haystackCache: [SearchHaystack]? = nil

    public init(index: QuoteIndex, loaded: [WriterData]) {
        self.index = index
        var order: [String: Int] = [:]
        for (i, w) in index.writers.enumerated() { order[w.slug] = i }
        let sorted = loaded.sorted { (order[$0.info.slug] ?? 0) < (order[$1.info.slug] ?? 0) }
        self.writers = sorted
        var all: [LibQuote] = []
        for w in sorted { all.append(contentsOf: w.quotes) }
        self.quotes = all
        var map: [String: LibQuote] = [:]
        for q in all { map[q.id] = q }
        self.byId = map
    }

    public func writerName(_ slug: String) -> String {
        if let w = writers.first(where: { $0.info.slug == slug }), !w.info.name.isEmpty { return w.info.name }
        return index.writers.first(where: { $0.slug == slug })?.name ?? slug
    }

    public func workTitle(_ writer: String, _ work: String) -> String {
        if let w = writers.first(where: { $0.info.slug == writer }), let k = w.works.first(where: { $0.slug == work }) { return k.title }
        return index.writers.first(where: { $0.slug == writer })?.works.first(where: { $0.slug == work })?.title ?? work
    }

    public func workInfo(_ writer: String, _ work: String) -> WorkInfo? {
        return writers.first(where: { $0.info.slug == writer })?.works.first(where: { $0.slug == work })
    }

    public var searchContext: SearchContext {
        return SearchContext(writerName: { [unowned self] s in self.writerName(s) }, workTitle: { [unowned self] w, k in self.workTitle(w, k) })
    }

    public func haystacks() -> [SearchHaystack] {
        if let h = haystackCache { return h }
        let ctx = searchContext
        let made = quotes.map { LibrarySearch.haystack($0, ctx) }
        haystackCache = made
        return made
    }

    public func search(_ query: String, limit: Int = 60) -> SearchResult {
        return LibrarySearch.search(quotes, haystacks: haystacks(), query: query, limit: limit)
    }
}
