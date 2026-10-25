import SwiftUI
import LockInKit

/// Where a screen in the Library goes next.
enum LibraryRoute: Hashable {
    case reader(LibraryScope, String?)
    case writer(String)
    case search
    case saved
    case yours
}

/// The Library tab: a library of real quotes to finish, like a book. The number that matters is how far in you are.
struct LibraryView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @State private var model: LibraryModel? = nil

    var body: some View {
        Group {
            if let model = model {
                LibraryHome(model: model)
            } else {
                ZStack {
                    LIBackground()
                    ProgressView().tint(theme.ink2)
                }
            }
        }
        .task {
            if model == nil { model = LibraryModel(db: store.db) }
            await model?.load()
            await store.rescheduleDrops()
        }
    }
}

private struct LibraryHome: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let model: LibraryModel
    @State private var dropsBusy = false
    @State private var dropsDenied = false

    private func fmt(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_US")
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }

    var body: some View {
        let index = try? LibraryCatalog.shared.index()
        ZStack {
            LIBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    if let index = index, !index.writers.isEmpty {
                        if let problem = model.problem {
                            LINotice(problem, warn: true, actionTitle: "Try again") { Task { await model.retry() } }
                                .padding(.top, 12)
                        } else if model.ready, let counts = model.counts {
                            progress(counts)
                            actions(counts, index: index)
                            yours
                            roughDay
                            writers(counts)
                            themes
                            drops
                        } else {
                            ProgressView().tint(theme.ink2).frame(maxWidth: .infinity).padding(.top, 80)
                        }
                    } else {
                        LIEmptyState(title: "No quotes yet", message: "The quotes ship with the app. This build has none.")
                            .padding(.top, 40)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await model.load() }
        }
        .navigationDestination(for: LibraryRoute.self) { route in
            switch route {
            case .reader(let scope, let id): LibraryReaderView(scope: scope, startId: id, model: model)
            case .writer(let slug): LibraryWriterView(slug: slug, model: model)
            case .search: LibrarySearchView(model: model)
            case .saved: LibrarySavedView(model: model)
            case .yours: LibraryYoursView()
            }
        }
    }

    // MARK: sections

    private var header: some View {
        HStack(alignment: .center) {
            LIPageHeader("Library")
            Spacer()
            NavigationLink(value: LibraryRoute.search) {
                Image(systemName: "magnifyingglass").font(.system(size: 19, weight: .regular)).foregroundColor(theme.ink2).frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Search")
            NavigationLink(value: LibraryRoute.saved) {
                Image(systemName: "bookmark").font(.system(size: 19, weight: .regular)).foregroundColor(theme.ink2).frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Saved")
        }
    }

    private func progress(_ counts: LibraryCounts) -> some View {
        let o = counts.overall
        let today = model.readToday(LIDate.todayNY())
        let finished = o.total > 0 && o.read >= o.total
        var sub = finished ? "All of them" : "\(LibraryProgress.percent(o))%"
        if today > 0 { sub += ". \(today) today" }
        return VStack(alignment: .leading, spacing: 6) {
            Text("Read").liType(.label).foregroundColor(theme.ink2)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(fmt(o.read)).liType(.display).foregroundColor(theme.ink)
                Text("of \(fmt(o.total))").liType(.value).foregroundColor(theme.ink2)
            }
            Text(sub)
                .liType(.sub).foregroundColor(theme.ink2)
            LIProgressBar(value: LibraryProgress.fraction(o)).padding(.top, 8)
        }
        .padding(.top, 12)
    }

    private func actions(_ counts: LibraryCounts, index: QuoteIndex) -> some View {
        let o = counts.overall
        let finished = o.total > 0 && o.read >= o.total
        var target: LibraryRoute = .reader(.writer(index.writers.first?.slug ?? "", work: nil), nil)
        var where_: String? = nil
        if let p = model.position, let scope = LibraryScopes.scopeFromQuery(p.scope) {
            target = .reader(scope, p.quoteId)
            where_ = LibraryScopes.scopeTitle(scope, writerName: { s in index.writers.first(where: { $0.slug == s })?.name }, workTitle: { w, k in index.writers.first(where: { $0.slug == w })?.works.first(where: { $0.slug == k })?.title })
        }
        let seed = model.position?.seed ?? LibraryQueue.newSeed()
        let saved = LibraryProgress.savedCount(model.marks)
        return VStack(spacing: 0) {
            NavigationLink(value: target) {
                Text(finished ? "Read again" : (o.read == 0 ? "Start reading" : "Continue"))
                    .liType(.body)
                    .foregroundColor(theme.accentInk)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Capsule().fill(theme.gradient))
            }
            .buttonStyle(LIPressStyle())
            .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
            if let w = where_, o.read > 0 {
                Text(w).liType(.caption).foregroundColor(theme.ink2).padding(.top, 10).frame(maxWidth: .infinity)
            }
            HStack(spacing: 12) {
                NavigationLink(value: LibraryRoute.reader(.shuffle(seed), nil)) {
                    secondaryLabel("Shuffle", systemImage: "shuffle", trailing: nil)
                }
                .buttonStyle(LIPressStyle())
                .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
                NavigationLink(value: LibraryRoute.saved) {
                    secondaryLabel("Saved", systemImage: "bookmark", trailing: String(saved))
                }
                .buttonStyle(LIPressStyle())
                .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
            }
            .padding(.top, 12)
        }
        .padding(.top, 24)
    }

    private func secondaryLabel(_ title: String, systemImage: String, trailing: String?) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage).font(.system(size: 15, weight: .regular))
            Text(title).liType(.body)
            if let t = trailing { Text(t).liType(.body).foregroundColor(theme.ink2) }
        }
        .foregroundColor(theme.ink)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(Capsule().fill(theme.tile))
        .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
    }

    /// His own lines, ahead of the writers.
    private var yours: some View {
        VStack(alignment: .leading, spacing: 8) {
            LISectionLabel("Yours")
            NavigationLink(value: LibraryRoute.yours) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Your own lines").liType(.body).foregroundColor(theme.ink)
                        Text("What you said yourself. It leads the morning.").liType(.caption).foregroundColor(theme.ink2)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .regular)).foregroundColor(theme.ink2)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .contentShape(Rectangle())
                .background(LITileSurface(radius: 24))
            }
            .buttonStyle(LIPressStyle())
            .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
        }
        .padding(.top, 32)
    }

    private var roughDay: some View {
        VStack(alignment: .leading, spacing: 12) {
            LISectionLabel("Rough day")
            LibFlow(spacing: 8) {
                ForEach(LibraryVocab.moments, id: \.self) { m in
                    NavigationLink(value: LibraryRoute.reader(.moment(m), nil)) {
                        chipLabel(LibraryVocab.momentLabel(m))
                    }
                    .buttonStyle(LIPressStyle())
                    .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
                }
            }
        }
        .padding(.top, 32)
    }

    private func writers(_ counts: LibraryCounts) -> some View {
        let done = counts.writers.filter { $0.total > 0 && $0.read >= $0.total }.count
        return VStack(alignment: .leading, spacing: 4) {
            LISectionLabel("Writers", trailing: "\(done) of \(counts.writers.count) done").padding(.bottom, 8)
            VStack(spacing: 0) {
                ForEach(Array(counts.writers.enumerated()), id: \.element.slug) { i, w in
                    if i > 0 { LIHairline() }
                    NavigationLink(value: LibraryRoute.writer(w.slug)) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(w.name).liType(.body).foregroundColor(theme.ink)
                                if w.total > 0 && w.read >= w.total {
                                    Image(systemName: "checkmark").font(.system(size: 12, weight: .medium)).foregroundColor(theme.accent)
                                }
                                Spacer()
                                HStack(alignment: .firstTextBaseline, spacing: 0) {
                                    Text(fmt(w.read)).liType(.value).foregroundColor(theme.ink)
                                    Text(" / \(fmt(w.total))").liType(.sub).foregroundColor(theme.ink2)
                                }
                            }
                            LIProgressBar(value: LibraryProgress.fraction(w.counts))
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
        .padding(.top, 32)
    }

    private var themes: some View {
        VStack(alignment: .leading, spacing: 12) {
            LISectionLabel("Themes")
            LibFlow(spacing: 8) {
                ForEach(LibraryVocab.themes, id: \.self) { t in
                    NavigationLink(value: LibraryRoute.reader(.theme(t), nil)) {
                        chipLabel(LibraryVocab.themeLabel(t))
                    }
                    .buttonStyle(LIPressStyle())
                    .simultaneousGesture(TapGesture().onEnded { LIHaptics.tap() })
                }
            }
        }
        .padding(.top, 32)
    }

    private func chipLabel(_ title: String) -> some View {
        Text(title)
            .liType(.sub)
            .foregroundColor(theme.ink)
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(Capsule().fill(theme.tile))
            .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
    }

    // MARK: drops

    private var dropsOn: Bool { store.settings?.dropsEnabled ?? false }
    private var perDay: Int { Drops.dropsPerDay(store.settings?.dropsPerDay) }

    private var drops: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Drops")
            LICard {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("A few quotes a day").liType(.body).foregroundColor(theme.ink)
                            Text("Short ones, as notifications, outside your quiet hours.").liType(.caption).foregroundColor(theme.ink2)
                        }
                        Spacer()
                        Toggle("", isOn: Binding(get: { dropsOn }, set: { setDrops($0, perDay: nil) }))
                            .labelsHidden()
                            .tint(theme.accent)
                            .disabled(dropsBusy)
                    }
                    if dropsOn {
                        LIHairline()
                        Stepper(value: Binding(get: { perDay }, set: { setDrops(true, perDay: $0) }), in: Drops.minPerDay...Drops.maxPerDay) {
                            Text("\(perDay) a day").liType(.body).foregroundColor(theme.ink)
                        }
                    }
                    if dropsDenied {
                        Text("Notifications are off for Lock In. Turn them on in Settings to get drops.").liType(.caption).foregroundColor(theme.warn)
                    }
                }
            }
        }
        .padding(.top, 32)
    }

    private func setDrops(_ on: Bool, perDay: Int?) {
        if dropsBusy { return }
        dropsBusy = true
        Task {
            let ok = await store.setDrops(enabled: on, perDay: perDay)
            dropsDenied = on && !ok
            dropsBusy = false
            if ok { LIHaptics.tap() } else { LIHaptics.error() }
        }
    }
}

/// Opens a single quote by id in the reader. Used by the Coach's "Read it in the Library".
struct LibraryQuoteRoute: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    let quoteId: String
    @State private var model: LibraryModel? = nil
    @State private var quote: LibQuote? = nil
    @State private var missing = false

    var body: some View {
        ZStack {
            LIBackground()
            if let model = model, let quote = quote {
                LibraryReaderView(scope: .writer(quote.writer, work: nil), startId: quote.id, model: model)
            } else if missing {
                LIEmptyState(title: "Not found", message: "That quote is not in the library.")
            } else {
                ProgressView().tint(theme.ink2)
            }
        }
        .task {
            if model == nil { model = LibraryModel(db: store.db) }
            await model?.load()
            if let q = await LibraryCatalog.shared.find(quoteId) { quote = q } else { missing = true }
        }
    }
}

// MARK: layout

/// Chips that wrap onto as many lines as they need.
struct LibFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
