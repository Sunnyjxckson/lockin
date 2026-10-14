import SwiftUI
import LockInKit

/// Loads every writer once for the screens that look across the whole library.
@Observable
@MainActor
final class LibraryAllModel {
    var library: Library? = nil
    var failure: String? = nil

    func load() async {
        if library != nil { return }
        failure = nil
        do {
            let catalog = LibraryCatalog.shared
            let index = try catalog.index()
            let loaded = try await catalog.writers(index.writers.map { $0.slug })
            library = Library(index: index, loaded: loaded)
        } catch {
            failure = (error as? LocalizedError)?.errorDescription ?? "Could not load the quotes."
        }
    }
}

/// One quote in a list: the words, who and where, and your note if there is one.
private struct QuoteRow: View {
    @Environment(\.liTheme) private var theme
    let text: String
    let by: String
    let meta: String?
    let note: String?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(text).liType(.body).foregroundColor(theme.ink).lineLimit(3).multilineTextAlignment(.leading)
                Text(meta.map { "\(by) \u{00B7} \($0)" } ?? by).liType(.caption).foregroundColor(theme.ink2).lineLimit(1)
                if let note = note, !note.isEmpty {
                    Text(note)
                        .liType(.sub)
                        .foregroundColor(theme.ink2)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
                }
            }
            Image(systemName: "chevron.right").font(.system(size: 13)).foregroundColor(theme.ink3).padding(.top, 6)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .contentShape(Rectangle())
    }
}

// MARK: search

struct LibrarySearchView: View {
    @Environment(\.liTheme) private var theme
    let model: LibraryModel
    @State private var all = LibraryAllModel()
    @State private var query = ""
    @State private var result: SearchResult? = nil
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            LIBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    field
                    results
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .task { await all.load() }
        .task(id: query) {
            // A short wait, so a burst of typing is one search.
            try? await Task.sleep(nanoseconds: 150_000_000)
            if Task.isCancelled { return }
            guard let lib = all.library else { return }
            let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
            result = q.isEmpty ? nil : lib.search(q)
        }
        .onChange(of: all.library == nil) { _, _ in
            if let lib = all.library {
                let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
                result = q.isEmpty ? nil : lib.search(q)
            }
        }
        .onAppear { focused = true }
    }

    private var field: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").font(.system(size: 16)).foregroundColor(theme.ink2)
            TextField("Words, a writer, a theme", text: $query)
                .liType(.body)
                .foregroundColor(theme.ink)
                .focused($focused)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !query.isEmpty {
                Button(action: { query = "" }) {
                    Image(systemName: "xmark.circle.fill").foregroundColor(theme.ink3).frame(width: 44, height: 44)
                }
                .buttonStyle(LIPressStyle())
                .accessibilityLabel("Clear")
            }
        }
        .padding(.leading, 16)
        .frame(minHeight: 48)
        .background(Capsule().fill(theme.tile))
        .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
        .padding(.top, 12)
    }

    @ViewBuilder
    private var results: some View {
        if let failure = all.failure {
            LIEmptyState(title: "Could not load the quotes", message: failure, actionTitle: "Try again") { Task { await all.load() } }
        } else if all.library == nil {
            ProgressView().tint(theme.ink2).frame(maxWidth: .infinity).padding(.top, 60)
        } else if let r = result, let lib = all.library {
            if r.hits.isEmpty {
                LIEmptyState(title: "Nothing found", message: "Try a single word, or a writer's name.")
            } else {
                LISectionLabel(r.total > r.hits.count ? "Best \(r.hits.count) of \(r.total)" : "\(r.total) found").padding(.top, 20)
                VStack(spacing: 0) {
                    ForEach(Array(r.hits.enumerated()), id: \.element.id) { i, q in
                        if i > 0 { LIHairline() }
                        NavigationLink(value: LibraryRoute.reader(.writer(q.writer, work: nil), q.id)) {
                            QuoteRow(text: q.text, by: lib.writerName(q.writer), meta: q.location.isEmpty ? nil : q.location, note: nil)
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
            }
        } else {
            Text("Search the quotes by their words, who wrote them, the work or a theme.")
                .liType(.sub).foregroundColor(theme.ink2).padding(.top, 24)
        }
    }
}

// MARK: saved

struct LibrarySavedView: View {
    @Environment(\.liTheme) private var theme
    let model: LibraryModel
    @State private var all = LibraryAllModel()

    var body: some View {
        ZStack {
            LIBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Saved")
        .navigationBarTitleDisplayMode(.inline)
        .task { await all.load() }
    }

    @ViewBuilder
    private var content: some View {
        if let failure = all.failure {
            LIEmptyState(title: "Could not load the quotes", message: failure, actionTitle: "Try again") { Task { await all.load() } }
        } else if let lib = all.library {
            let ids = model.savedIds.filter { lib.byId[$0] != nil }
            if ids.isEmpty {
                LIEmptyState(title: "Nothing saved yet", message: "Tap the bookmark on a quote to keep it.")
                    .padding(.top, 40)
            } else {
                NavigationLink(value: LibraryRoute.reader(.saved, nil)) {
                    Text("Read them")
                        .liType(.body)
                        .foregroundColor(theme.accentInk)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(Capsule().fill(theme.gradient))
                }
                .buttonStyle(LIPressStyle())
                .padding(.top, 12)
                LISectionLabel("\(ids.count) saved").padding(.top, 24)
                VStack(spacing: 0) {
                    ForEach(Array(ids.enumerated()), id: \.element) { i, id in
                        if let q = lib.byId[id] {
                            if i > 0 { LIHairline() }
                            NavigationLink(value: LibraryRoute.reader(.saved, q.id)) {
                                QuoteRow(text: q.text, by: lib.writerName(q.writer), meta: q.location.isEmpty ? nil : q.location, note: model.marks[q.id]?.note)
                            }
                            .buttonStyle(LIPressStyle())
                        }
                    }
                }
            }
        } else {
            ProgressView().tint(theme.ink2).frame(maxWidth: .infinity).padding(.top, 60)
        }
    }
}

// MARK: writer

struct LibraryWriterView: View {
    @Environment(\.liTheme) private var theme
    let slug: String
    let model: LibraryModel
    @State private var info: WriterInfo? = nil

    var body: some View {
        let index = try? LibraryCatalog.shared.index()
        let counts = model.counts?.writers.first(where: { $0.slug == slug })
        ZStack {
            LIBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if let c = counts {
                        LIPageHeader(c.name, eyebrow: info?.years, subtitle: nil)
                        if let bio = info?.bio, !bio.isEmpty {
                            Text(bio).liType(.body).foregroundColor(theme.ink2).fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                        }
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text("\(c.read)").liType(.display).foregroundColor(theme.ink)
                            Text("of \(c.total)").liType(.value).foregroundColor(theme.ink2)
                        }
                        .padding(.top, 24)
                        LIProgressBar(value: LibraryProgress.fraction(c.counts)).padding(.top, 10)

                        NavigationLink(value: LibraryRoute.reader(.writer(slug, work: nil), nil)) {
                            Text(c.total > 0 && c.read >= c.total ? "Read again" : (c.read == 0 ? "Start reading" : "Continue"))
                                .liType(.body)
                                .foregroundColor(theme.accentInk)
                                .frame(maxWidth: .infinity, minHeight: 52)
                                .background(Capsule().fill(theme.gradient))
                        }
                        .buttonStyle(LIPressStyle())
                        .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
                        .padding(.top, 24)

                        if c.works.count > 1 {
                            LISectionLabel("Works").padding(.top, 32).padding(.bottom, 8)
                            VStack(spacing: 0) {
                                ForEach(Array(c.works.enumerated()), id: \.element.slug) { i, w in
                                    if i > 0 { LIHairline() }
                                    NavigationLink(value: LibraryRoute.reader(.writer(slug, work: w.slug), nil)) {
                                        VStack(alignment: .leading, spacing: 10) {
                                            HStack(alignment: .firstTextBaseline) {
                                                Text(w.title).liType(.body).foregroundColor(theme.ink).multilineTextAlignment(.leading)
                                                Spacer()
                                                Text("\(w.read) / \(w.total)").liType(.sub).foregroundColor(theme.ink2)
                                            }
                                            LIProgressBar(value: LibraryProgress.fraction(ReadCounts(read: w.read, total: w.total)))
                                        }
                                        .padding(.horizontal, 18)
                                        .padding(.vertical, 16)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(LIPressStyle())
                                }
                            }
                            .background(LITileSurface(radius: 24))
                        }
                    } else {
                        LIEmptyState(title: "No such writer", message: index == nil ? "The quotes did not load." : nil)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let data = try? await LibraryCatalog.shared.writer(slug) { info = data.info }
        }
    }
}
