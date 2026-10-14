import SwiftUI
import LockInKit

/// Counts a quote as read by the rule in LibraryReading: time on screen with the app in front, or a pass that was long enough.
@MainActor
final class ReadTracker {
    private var quote: LibQuote? = nil
    private var accumMs: Double = 0
    private var since: Date? = nil
    private var timer: Task<Void, Never>? = nil
    var onCommit: ((LibQuote) -> Void)? = nil

    private func totalMs() -> Double {
        var t = accumMs
        if let s = since { t += Date().timeIntervalSince(s) * 1000 }
        return t
    }

    private func arm() {
        timer?.cancel()
        timer = nil
        guard let q = quote, since != nil else { return }
        let wait = max(0, LibraryReading.dwellMs(q.text) - totalMs())
        timer = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000))
            if Task.isCancelled { return }
            self?.fire(q)
        }
    }

    private func fire(_ q: LibQuote) {
        if quote?.id == q.id { onCommit?(q) }
    }

    /// A new quote is on screen. The one before it is judged first.
    func show(_ q: LibQuote?, active: Bool, movedPast: Bool = true) {
        finish(movedPast: movedPast)
        quote = q
        accumMs = 0
        since = (q != nil && active) ? Date() : nil
        arm()
    }

    func setActive(_ active: Bool) {
        if quote == nil { return }
        if active {
            if since == nil { since = Date() }
            arm()
        } else {
            if let s = since { accumMs += Date().timeIntervalSince(s) * 1000 }
            since = nil
            timer?.cancel()
            timer = nil
        }
    }

    func finish(movedPast: Bool) {
        timer?.cancel()
        timer = nil
        if let q = quote, LibraryReading.countsAsRead(visibleMs: totalMs(), text: q.text, movedPast: movedPast) {
            onCommit?(q)
        }
        quote = nil
        accumMs = 0
        since = nil
    }
}

private enum ReaderSheet: String, Identifiable {
    case note, deeper
    var id: String { rawValue }
}

private let endPage = "~end"

/// The reader: one quote fills the screen. Swipe for the next one. Save in one tap; a note and Go deeper open sheets.
struct LibraryReaderView: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.scenePhase) private var scenePhase
    let scope: LibraryScope
    let startId: String?
    let model: LibraryModel

    @State private var library: Library? = nil
    @State private var scopeList: [LibQuote] = []
    @State private var queue: ReadingQueue? = nil
    @State private var current: String? = nil
    @State private var failure: String? = nil
    @State private var sheet: ReaderSheet? = nil
    @State private var milestone: LibraryMilestone? = nil
    @State private var tracker = ReadTracker()

    private var title: String {
        guard let lib = library else { return LibraryScopes.scopeTitle(scope, writerName: { _ in nil }) }
        return LibraryScopes.scopeTitle(scope, writerName: { lib.writerName($0) }, workTitle: { lib.workTitle($0, $1) })
    }

    private var currentQuote: LibQuote? {
        guard let id = current, let lib = library else { return nil }
        return lib.byId[id]
    }

    var body: some View {
        ZStack {
            LIBackground()
            content
            if let m = milestone {
                MilestoneMoment(milestone: m, total: library?.index.total ?? 0) {
                    withAnimation(.easeOut(duration: 0.3)) { milestone = nil }
                }
                .transition(.opacity)
                .zIndex(2)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await prepare() }
        .onChange(of: scenePhase) { _, phase in tracker.setActive(phase == .active) }
        .onDisappear {
            tracker.finish(movedPast: false)
            Task { await model.flushPosition() }
        }
        .sheet(item: $sheet) { which in
            if let q = currentQuote, let lib = library {
                switch which {
                case .note:
                    ReaderNoteSheet(quote: q, writer: lib.writerName(q.writer), note: model.marks[q.id]?.note ?? "") { text in
                        model.setNote(q, text)
                    }
                    .liSheetStyle()
                case .deeper:
                    DeeperSheet(quote: q, library: lib).liSheetStyle()
                }
            }
        }
    }

    // MARK: states

    @ViewBuilder
    private var content: some View {
        if let failure = failure {
            LIEmptyState(title: "Could not load the quotes", message: failure, actionTitle: "Try again") {
                self.failure = nil
                Task { await prepare() }
            }
        } else if library == nil || queue == nil {
            ProgressView().tint(theme.ink2)
        } else if scopeList.isEmpty {
            LIEmptyState(
                title: scope == .saved ? "Nothing saved yet" : "Nothing here yet",
                message: scope == .saved ? "Tap the bookmark on a quote to keep it." : "No quotes match this one."
            )
        } else if let q = queue, let lib = library {
            reader(q, lib)
        }
    }

    private func reader(_ q: ReadingQueue, _ lib: Library) -> some View {
        let pages = q.ids + [endPage]
        let counts = LibraryQueue.scopeCounts(scopeList, model.marks)
        let idx = current.flatMap { id in pages.firstIndex(of: id) } ?? 0
        let progress: Double = q.review
            ? (q.ids.isEmpty ? 0 : Double(min(idx + 1, q.ids.count)) / Double(q.ids.count))
            : LibraryProgress.fraction(ReadCounts(read: counts.read, total: counts.total))
        let right = q.review ? "\(min(idx + 1, q.ids.count)) of \(q.ids.count)" : "\(counts.read) of \(counts.total)"
        return VStack(spacing: 0) {
            VStack(spacing: 8) {
                HStack {
                    Text(q.pass == 2 ? "Second time" : (q.review ? "Collection" : "Reading")).liType(.label).foregroundColor(theme.ink2)
                    Spacer()
                    Text(right).liType(.label).foregroundColor(theme.ink2)
                }
                LIProgressBar(value: progress)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(pages, id: \.self) { id in
                        Group {
                            if id == endPage {
                                EndCard(queue: q, scope: scope, title: title, counts: counts, unread: scopeList.count - counts.read) { again(lib) }
                            } else if let quote = lib.byId[id] {
                                QuotePage(quote: quote, library: lib)
                            } else {
                                Color.clear
                            }
                        }
                        .containerRelativeFrame(.horizontal)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $current)
            .onChange(of: current) { _, id in moved(to: id, lib: lib, queue: q) }

            controls(pages: pages, idx: idx, lib: lib)
        }
    }

    private func controls(pages: [String], idx: Int, lib: Library) -> some View {
        let quote = currentQuote
        let mark = quote.flatMap { model.marks[$0.id] }
        let saved = mark?.savedAt != nil
        let overall = LibraryProgress.libraryCounts(lib.index, model.marks).overall
        return VStack(spacing: 10) {
            HStack {
                Text("\(overall.read) of \(overall.total) in the library").liType(.caption).foregroundColor(theme.ink2)
                Spacer()
                if mark?.readAt != nil && quote != nil { Text("Read").liType(.caption).foregroundColor(theme.ink2) }
            }
            HStack(spacing: 8) {
                roundButton("chevron.left", label: "Previous quote", disabled: idx == 0) { step(-1, pages: pages, idx: idx) }
                roundButton(saved ? "bookmark.fill" : "bookmark", label: saved ? "Remove from saved" : "Save", disabled: quote == nil, filled: saved) {
                    if let q = quote {
                        if saved { LIHaptics.tap() } else { LIHaptics.check() }
                        model.setSaved(q, !saved)
                    }
                }
                roundButton(mark?.note != nil ? "note.text" : "square.and.pencil", label: mark?.note != nil ? "Edit note" : "Add a note", disabled: quote == nil) {
                    sheet = .note
                }
                LISecondaryButton("Go deeper") { sheet = .deeper }
                    .disabled(quote == nil)
                Spacer(minLength: 0)
                Button(action: {
                    LIHaptics.tap()
                    step(1, pages: pages, idx: idx)
                }) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundColor(theme.accentInk)
                        .frame(width: 56, height: 56)
                        .background(Circle().fill(theme.gradient))
                        .opacity(idx >= pages.count - 1 ? 0.35 : 1)
                }
                .buttonStyle(LIPressStyle())
                .disabled(idx >= pages.count - 1)
                .accessibilityLabel("Next quote")
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private func roundButton(_ icon: String, label: String, disabled: Bool, filled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .regular))
                .foregroundColor(filled ? theme.bg : theme.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(filled ? theme.ink : theme.tile))
                .overlay(Circle().strokeBorder(filled ? Color.clear : theme.tileLine, lineWidth: 1))
                .opacity(disabled ? 0.35 : 1)
        }
        .buttonStyle(LIPressStyle())
        .disabled(disabled)
        .accessibilityLabel(label)
    }

    // MARK: moving and counting

    private func step(_ delta: Int, pages: [String], idx: Int) {
        let next = max(0, min(pages.count - 1, idx + delta))
        if next == idx { return }
        withAnimation(.easeOut(duration: 0.28)) { current = pages[next] }
    }

    private func moved(to id: String?, lib: Library, queue q: ReadingQueue) {
        guard let id = id else { return }
        let quote = lib.byId[id]
        tracker.show(quote, active: scenePhase == .active)
        if scope != .saved {
            var at = id
            if id == endPage { at = q.ids.last ?? id }
            var seed: Int? = model.position?.seed
            if case .shuffle(let s) = scope { seed = s }
            model.savePosition(LibraryPosition(scope: LibraryScopes.scopeQuery(scope), quoteId: at, at: LIDate.nowIso(), seed: seed))
        }
    }

    private func commit(_ q: LibQuote) {
        guard let lib = library else { return }
        if model.markRead(q) {
            let found = LibraryProgress.milestonesAfterRead(lib.index, model.marks, writer: q.writer)
            if let first = found.first {
                LIHaptics.celebrate()
                withAnimation(.easeOut(duration: 0.3)) { milestone = first }
            }
        }
    }

    private func again(_ lib: Library) {
        let last = queue?.ids.last
        let next = LibraryQueue.buildQueue(scope, scopeList, model.marks, startAt: nil, after: last)
        LIHaptics.tap()
        queue = next
        current = next.ids.indices.contains(next.start) ? next.ids[next.start] : endPage
    }

    private func prepare() async {
        if library != nil { return }
        failure = nil
        if !model.ready { await model.load() }
        do {
            let catalog = LibraryCatalog.shared
            let index = try catalog.index()
            var slugs: [String]
            if case .writer(let w, _) = scope { slugs = [w] } else { slugs = index.writers.map { $0.slug } }
            // A start quote from another writer's file needs that file too.
            if let id = startId, case .writer(let w, _) = scope, !id.hasPrefix(w + "-") && !id.hasPrefix(w + ":"), let found = await catalog.find(id) {
                if !slugs.contains(found.writer) { slugs.append(found.writer) }
            }
            let loaded = try await catalog.writers(slugs)
            let lib = Library(index: index, loaded: loaded)
            let list = LibraryQueue.scopeQuotes(scope, lib.quotes, model.marks)
            let resume: String? = (startId == nil && model.position?.scope == LibraryScopes.scopeQuery(scope)) ? model.position?.quoteId : nil
            let built = LibraryQueue.buildQueue(scope, list, model.marks, startAt: startId ?? resume, after: nil)
            tracker.onCommit = { q in commit(q) }
            library = lib
            scopeList = list
            queue = built
            let first = built.ids.indices.contains(built.start) ? built.ids[built.start] : endPage
            current = first
            // The first quote counts from here. onChange does not fire for the initial value.
            moved(to: first, lib: lib, queue: built)
        } catch {
            failure = (error as? LocalizedError)?.errorDescription ?? "Could not load the quotes."
        }
    }
}

// MARK: pages

private struct QuotePage: View {
    @Environment(\.liTheme) private var theme
    let quote: LibQuote
    let library: Library

    var body: some View {
        let size = LibraryLayout.quoteSizes[min(max(LibraryLayout.quoteStep(quote.text), 0), LibraryLayout.quoteSizes.count - 1)]
        let lines = quote.text.components(separatedBy: "\n")
        let cite = LibraryCite.citeQuote(quote, workTitle: library.workTitle(quote.writer, quote.work))
        let law = LibraryCite.isLaw(quote)
        let translator = law ? "" : (library.workInfo(quote.writer, quote.work)?.translator ?? "")
        let href = LibraryCite.safeUrl(cite.sourceUrl)
        GeometryReader { geo in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(LIFont.medium(size))
                                .tracking(-size * 0.022)
                                .lineSpacing(size * 0.2)
                                .foregroundColor(theme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(law ? cite.title : library.writerName(quote.writer)).liType(.label).foregroundColor(theme.accent)
                        if !law { Text(cite.title).liType(.caption).foregroundColor(theme.ink2) }
                        ForEach(cite.lines, id: \.self) { l in
                            Text(l).liType(.caption).foregroundColor(theme.ink2)
                        }
                        if !translator.isEmpty { Text("Translated by \(translator)").liType(.caption).foregroundColor(theme.ink2) }
                        if let source = cite.source, !source.isEmpty {
                            if let h = href, let url = URL(string: h) {
                                Link(destination: url) {
                                    HStack(spacing: 6) {
                                        Text("Source: \(source)").liType(.caption).underline()
                                        Image(systemName: "arrow.up.right").font(.system(size: 11))
                                    }
                                    .foregroundColor(theme.ink2)
                                    .frame(minHeight: 44, alignment: .leading)
                                }
                            } else {
                                Text("Source: \(source)").liType(.caption).foregroundColor(theme.ink2)
                            }
                        }
                    }
                    .padding(.top, 24)
                    if !quote.plain.isEmpty {
                        Rectangle().fill(theme.hair).frame(height: 1).padding(.top, 20)
                        Text(quote.plain).liType(.body).foregroundColor(theme.ink2).padding(.top, 16).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .leading)
                .frame(maxHeight: .infinity, alignment: .center)
            }
        }
    }
}

private struct EndCard: View {
    @Environment(\.liTheme) private var theme
    let queue: ReadingQueue
    let scope: LibraryScope
    let title: String
    let counts: ScopeCounts
    let unread: Int
    let onAgain: () -> Void

    var body: some View {
        let finished = !queue.review && unread == 0
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)
            Text(queue.review ? "End of the collection" : (finished ? "Finished" : "End of the queue"))
                .liType(.label).foregroundColor(theme.accent)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(counts.read)").liType(.display).foregroundColor(theme.ink)
                Text("of \(counts.total)").liType(.value).foregroundColor(theme.ink2)
            }
            .padding(.top, 16)
            Text(message(finished: finished)).liType(.sub).foregroundColor(theme.ink2).padding(.top, 12)
            if !queue.review {
                LIPrimaryButton(finished ? "Go through again" : "Read the rest", action: onAgain).padding(.top, 28)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func message(finished: Bool) -> String {
        if queue.review { return "That was all of them." }
        if finished { return "Every quote in \(title) is read. Going again starts a second time through." }
        return "\(unread) in \(title) \(unread == 1 ? "was" : "were") passed too quickly to count. They are next."
    }
}
