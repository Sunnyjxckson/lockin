import SwiftUI
import LockInKit

/// Yours: the lines he said himself. The morning drop and the quote widget use them before any library quote.
struct LibraryYoursView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @State private var lines: [Motivation] = []
    @State private var loaded = false
    @State private var failure: String? = nil
    @State private var sheet: YoursSheet? = nil

    enum YoursSheet: Identifiable {
        case add
        case edit(Motivation)

        var id: String {
            switch self {
            case .add: return "add"
            case .edit(let m): return "edit." + m.id
            }
        }
    }

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
            .refreshable { await load() }
        }
        .navigationTitle("Yours")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    LIHaptics.tap()
                    sheet = .add
                } label: {
                    Image(systemName: "plus").foregroundColor(theme.ink2)
                }
                .accessibilityLabel("Add a line")
            }
        }
        .task { await load() }
        .sheet(item: $sheet) { which in
            switch which {
            case .add:
                YoursLineSheet(existing: nil) { text in _ = try await store.addOwnLine(text) } onDelete: { _ in }
                    .liSheetStyle()
                    .onDisappear { Task { await load() } }
            case .edit(let m):
                YoursLineSheet(existing: m) { text in try await store.updateOwnLine(id: m.id, text: text) } onDelete: { id in try await store.deleteOwnLine(id: id) }
                    .liSheetStyle()
                    .onDisappear { Task { await load() } }
            }
        }
    }

    private func load() async {
        // The first visit also puts in the starting line when there are none, and keeps the drops and widget current.
        await store.syncOwnLines()
        do {
            lines = try await store.loadOwnLines()
            failure = nil
        } catch {
            failure = "Could not load your lines."
        }
        loaded = true
    }

    @ViewBuilder
    private var content: some View {
        if let failure = failure, lines.isEmpty {
            LIEmptyState(title: failure, message: "Check your connection and try again.", actionTitle: "Try again") { Task { await load() } }
                .padding(.top, 40)
        } else if !loaded {
            ProgressView().tint(theme.ink2).frame(maxWidth: .infinity).padding(.top, 80)
        } else if lines.isEmpty {
            LIEmptyState(title: "Nothing here yet", message: "Write a line you want to hear in the morning. It comes before any quote.", actionTitle: "Add a line") { sheet = .add }
                .padding(.top, 40)
        } else {
            list
        }
    }

    private var list: some View {
        let todays = Drops.pickOwnLine(lines.map { OwnLine(id: $0.id, body: $0.body) }, date: LIDate.todayNY())?.id
        return VStack(alignment: .leading, spacing: 0) {
            Text("The first thing you see each morning. One a day, in turn, before any quote.")
                .liType(.sub).foregroundColor(theme.ink2).padding(.top, 12)
            LIPrimaryButton("Add a line") {
                LIHaptics.tap()
                sheet = .add
            }
            .padding(.top, 20)
            LISectionLabel("\(lines.count) \(lines.count == 1 ? "line" : "lines")").padding(.top, 28).padding(.bottom, 8)
            VStack(spacing: 0) {
                ForEach(Array(lines.enumerated()), id: \.element.id) { i, m in
                    if i > 0 { LIHairline() }
                    Button {
                        LIHaptics.tap()
                        sheet = .edit(m)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            if m.id == todays { Text("Today").liType(.label).foregroundColor(theme.accent) }
                            Text(m.body)
                                .liType(.body)
                                .foregroundColor(theme.ink)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 16)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(LIPressStyle())
                }
            }
            .background(LITileSurface(radius: 24))
        }
    }
}

/// Write or change one line. Changing one can also remove it.
struct YoursLineSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    let existing: Motivation?
    let onSave: (String) async throws -> Void
    let onDelete: (String) async throws -> Void
    @State private var text: String
    @State private var busy = false
    @State private var error: String? = nil
    @State private var confirmDelete = false
    @FocusState private var focused: Bool

    init(existing: Motivation?, onSave: @escaping (String) async throws -> Void, onDelete: @escaping (String) async throws -> Void) {
        self.existing = existing
        self.onSave = onSave
        self.onDelete = onDelete
        _text = State(initialValue: existing?.body ?? "")
    }

    private var empty: Bool { return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(existing == nil ? "Add a line" : "Your line").liType(.h1).foregroundColor(theme.ink).padding(.top, 24)
            Text("Something you said, in your words.").liType(.sub).foregroundColor(theme.ink2)
            TextEditor(text: $text)
                .font(LIFont.regular(16))
                .foregroundColor(theme.ink)
                .scrollContentBackground(.hidden)
                .focused($focused)
                .padding(12)
                .frame(minHeight: 140)
                .background(LITileSurface(radius: 20))
                .onChange(of: text) { _, v in
                    if v.count > AppStore.ownLineMax { text = String(v.prefix(AppStore.ownLineMax)) }
                }
            if let error = error {
                Text(error).liType(.caption).foregroundColor(theme.warn)
            }
            LIPrimaryButton("Save", busy: busy) { save() }
                .disabled(empty || busy)
                .opacity(empty ? 0.5 : 1)
            if let m = existing {
                Button {
                    confirmDelete = true
                } label: {
                    Text("Delete this line")
                        .liType(.body)
                        .foregroundColor(theme.warn)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(LIPressStyle())
                .disabled(busy)
                .confirmationDialog("Delete this line?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) { remove(m.id) }
                    Button("Keep it", role: .cancel) {}
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .onAppear { focused = existing == nil }
    }

    private func save() {
        if busy || empty { return }
        busy = true
        error = nil
        Task {
            do {
                try await onSave(text)
                LIHaptics.check()
                dismiss()
            } catch {
                self.error = (error as? LocalizedError)?.errorDescription ?? "Could not save that. Try again."
                LIHaptics.error()
            }
            busy = false
        }
    }

    private func remove(_ id: String) {
        if busy { return }
        busy = true
        error = nil
        Task {
            do {
                try await onDelete(id)
                dismiss()
            } catch {
                self.error = "Could not delete that. Try again."
                LIHaptics.error()
            }
            busy = false
        }
    }
}
