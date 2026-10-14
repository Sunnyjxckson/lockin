import SwiftUI
import LockInKit

/// Why it hit. Saving a note saves the quote too.
struct ReaderNoteSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let quote: LibQuote
    let writer: String
    let note: String
    let onSave: (String) -> Void
    @State private var text: String
    @FocusState private var focused: Bool

    init(quote: LibQuote, writer: String, note: String, onSave: @escaping (String) -> Void) {
        self.quote = quote
        self.writer = writer
        self.note = note
        self.onSave = onSave
        _text = State(initialValue: note)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Why it hit").liType(.h1).foregroundColor(theme.ink).padding(.top, 24)
            VStack(alignment: .leading, spacing: 6) {
                Text(quote.text).liType(.sub).foregroundColor(theme.ink2).lineLimit(3)
                Text(writer).liType(.caption).foregroundColor(theme.ink2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LITileSurface(radius: 20))
            TextEditor(text: $text)
                .font(LIFont.regular(16))
                .foregroundColor(theme.ink)
                .scrollContentBackground(.hidden)
                .focused($focused)
                .padding(12)
                .frame(minHeight: 140)
                .background(LITileSurface(radius: 20))
                .onChange(of: text) { _, v in
                    if v.count > 2000 { text = String(v.prefix(2000)) }
                }
            LIPrimaryButton(!note.isEmpty && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Remove note" : "Save note") {
                onSave(text)
                dismiss()
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .onAppear { focused = true }
    }
}

/// Go deeper: the passage the quote comes from with the quote picked out in it, then who wrote it and the work it is in.
struct DeeperSheet: View {
    @Environment(\.liTheme) private var theme
    let quote: LibQuote
    let library: Library
    @State private var passage: String? = nil
    @State private var state: LoadPhase = .loading

    enum LoadPhase { case loading, ready, failed }

    var body: some View {
        let law = LibraryCite.isLaw(quote)
        let cite = LibraryCite.citeQuote(quote, workTitle: library.workTitle(quote.writer, quote.work))
        let info = library.writers.first(where: { $0.info.slug == quote.writer })?.info
        let work = library.workInfo(quote.writer, quote.work)
        let paragraphs: [[PassagePiece]] = (passage.map { LibraryPassage.passageParagraphs($0, quote.text) }) ?? []
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Go deeper").liType(.h1).foregroundColor(theme.ink).padding(.top, 24)
                    Text(law ? cite.title : "\(library.writerName(quote.writer)), \(quote.location)")
                        .liType(.sub).foregroundColor(theme.ink2).padding(.top, 4)

                    Text(law ? "Where it came from" : "Around it").liType(.label).foregroundColor(theme.ink2).padding(.top, 24)
                    passageView(paragraphs: paragraphs, law: law)
                        .padding(.top, 12)

                    if law {
                        section("Attributed to") {
                            Text(quote.by ?? "").liType(.h2).foregroundColor(theme.ink)
                            if let y = quote.year, !y.isEmpty { Text(y).liType(.sub).foregroundColor(theme.ink2) }
                            if let source = cite.source, !source.isEmpty {
                                Text("Source").liType(.label).foregroundColor(theme.ink2).padding(.top, 16)
                                Text(source).liType(.body).foregroundColor(theme.ink2)
                                sourceLink(cite.sourceUrl)
                            }
                        }
                    } else {
                        if let info = info, !info.name.isEmpty {
                            section("The writer") {
                                Text(info.name).liType(.h2).foregroundColor(theme.ink)
                                if !info.years.isEmpty { Text(info.years).liType(.sub).foregroundColor(theme.ink2) }
                                if !info.bio.isEmpty { Text(info.bio).liType(.body).foregroundColor(theme.ink2).fixedSize(horizontal: false, vertical: true) }
                            }
                        }
                        if let work = work {
                            section("The work") {
                                Text(work.title).liType(.h2).foregroundColor(theme.ink)
                                let meta = [work.year, work.translator.isEmpty ? "" : "Translated by \(work.translator)"].filter { !$0.isEmpty }.joined(separator: ". ")
                                if !meta.isEmpty { Text(meta).liType(.sub).foregroundColor(theme.ink2) }
                                if !work.note.isEmpty { Text(work.note).liType(.body).foregroundColor(theme.ink2).fixedSize(horizontal: false, vertical: true) }
                                sourceLink(work.sourceUrl)
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: state) { _, _ in
                if let i = paragraphs.firstIndex(where: { $0.contains(where: { $0.hit }) }) {
                    withAnimation { proxy.scrollTo("p\(i)", anchor: .center) }
                }
            }
        }
        .task(id: quote.id) { await load() }
    }

    @ViewBuilder
    private func passageView(paragraphs: [[PassagePiece]], law: Bool) -> some View {
        switch state {
        case .loading:
            Text(law ? "Loading the note" : "Loading the passage").liType(.sub).foregroundColor(theme.ink2)
        case .failed:
            Text(law ? "The note did not load. Close this and open it again." : "The passage did not load. Close this and open it again.")
                .liType(.sub).foregroundColor(theme.ink2)
        case .ready:
            if paragraphs.isEmpty {
                Text(law ? "There is no origin note for this one." : "There is no longer passage for this one.").liType(.sub).foregroundColor(theme.ink2)
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(paragraphs.enumerated()), id: \.offset) { i, para in
                        paragraphText(para).fixedSize(horizontal: false, vertical: true).id("p\(i)")
                    }
                }
            }
        }
    }

    private func paragraphText(_ pieces: [PassagePiece]) -> some View {
        var t = Text("")
        for p in pieces {
            if p.hit {
                t = t + Text(p.text).font(LIFont.medium(15)).foregroundColor(theme.ink)
            } else {
                t = t + Text(p.text).font(LIFont.regular(15)).foregroundColor(theme.ink2)
            }
        }
        return t.lineSpacing(4)
    }

    private func section<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Rectangle().fill(theme.hair).frame(height: 1).padding(.bottom, 16)
            Text(label).liType(.label).foregroundColor(theme.ink2)
            content()
        }
        .padding(.top, 28)
    }

    @ViewBuilder
    private func sourceLink(_ raw: String?) -> some View {
        if let h = LibraryCite.safeUrl(raw), let url = URL(string: h) {
            Link(destination: url) {
                HStack(spacing: 8) {
                    Text("Read the source").liType(.sub)
                    Image(systemName: "arrow.up.right").font(.system(size: 12))
                }
                .foregroundColor(theme.ink)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(Capsule().fill(theme.tile))
                .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
            }
            .padding(.top, 10)
        }
    }

    private func load() async {
        state = .loading
        do {
            let all = try await LibraryCatalog.shared.context(quote.writer)
            passage = all[quote.id]
            state = .ready
        } catch {
            state = .failed
        }
    }
}

/// The moment a writer, the library or a round number is reached. It goes away by itself or on a tap.
struct MilestoneMoment: View {
    @Environment(\.liTheme) private var theme
    let milestone: LibraryMilestone
    let total: Int
    let onDone: () -> Void
    @State private var closed = false

    private var copy: (label: String, title: String, line: String, ring: Double) {
        switch milestone {
        case .library(let t): return ("The whole library", String(t), "\(t) of \(t) read. Every one.", 1)
        case .writer(_, let name, let count): return ("Finished", name, "\(count) of \(count) read.", 1)
        case .count(let read): return ("Quotes read", String(read), "of \(total).", total > 0 ? Double(read) / Double(total) : 0)
        }
    }

    var body: some View {
        let c = copy
        ZStack {
            theme.bg.opacity(0.96).ignoresSafeArea()
            VStack(spacing: 0) {
                LIProgressRing(value: closed ? c.ring : 0, size: 156, stroke: 6) {
                    Image(systemName: "checkmark").font(.system(size: 40, weight: .light)).foregroundColor(theme.accent)
                }
                Text(c.label).liType(.label).foregroundColor(theme.accent).padding(.top, 32)
                Text(c.title).liType(c.title.count > 9 ? .num : .display).foregroundColor(theme.ink).multilineTextAlignment(.center).padding(.top, 14)
                Text(c.line).liType(.body).foregroundColor(theme.ink2).padding(.top, 14)
            }
            .padding(.horizontal, 32)
        }
        .contentShape(Rectangle())
        .onTapGesture { onDone() }
        .accessibilityLabel("Dismiss")
        .task {
            try? await Task.sleep(nanoseconds: 50_000_000)
            closed = true
            try? await Task.sleep(nanoseconds: 3_400_000_000)
            onDone()
        }
    }
}
