import SwiftUI
import LockInKit

/// The notes screen: this morning's brief, the flags, the Sunday review and the history.
struct CoachNotesView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @State private var notes: [CoachNote] = []
    @State private var loading = true
    @State private var problem: String? = nil
    @State private var writing: CoachNoteKind? = nil
    @State private var openNote: CoachNote? = nil
    @State private var today: DateStr = LIDate.todayNY()

    private var historyStart: DateStr { store.coachHistoryStart }
    private var brief: CoachNote? { notes.first { $0.kind == .morning && $0.date == today } }
    private var weekly: CoachNote? { notes.first { $0.kind == .weekly } }
    private var flags: [(note: CoachNote, flag: FlagNote)] { CoachChat.activeFlagNotes(notes) }
    private var due: ReviewDue? { CoachChat.reviewDue(today: today, time: LIDate.timeNY(), historyStart: historyStart) }
    private var phaseBefore: Bool { today < historyStart }

    private var history: [CoachNote] {
        return notes.filter { n in
            if n.kind == .morning { return n.date != today }
            if n.kind == .weekly { return n.id != weekly?.id }
            if let f = CoachChat.parseFlagNote(n.body) { return f.resolvedOn != nil || f.dismissedOn != nil }
            return false
        }
    }

    var body: some View {
        ZStack {
            LIBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LIPageHeader("Notes", subtitle: LIDate.formatDateLong(today))
                    if let problem = problem {
                        LINotice(problem, warn: true, actionTitle: "Try again") { Task { await load() } }
                            .padding(.bottom, 12)
                    }
                    if loading {
                        ProgressView().tint(theme.ink2).frame(maxWidth: .infinity).padding(.top, 60)
                    } else if phaseBefore {
                        LIEmptyState(title: "Nothing to read yet", message: "The first brief lands on your first morning.")
                    } else {
                        briefCard
                        flagsSection
                        weeklySection
                        historySection
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await load() }
        }
        .navigationTitle("Notes")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $openNote) { n in
            NoteSheet(note: n).liSheetStyle()
        }
    }

    // MARK: sections

    @ViewBuilder
    private var briefCard: some View {
        if let b = brief {
            LICard(feature: true) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Text("Morning brief").liType(.label).foregroundColor(theme.ink2)
                        Spacer()
                        regenerateButton(.morning, title: "Regenerate")
                    }
                    NoteText(text: b.body)
                    SourceLine(source: b.source)
                }
            }
            .transition(.opacity)
        } else if writing == .morning {
            LICard(feature: true) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Morning brief").liType(.label).foregroundColor(theme.ink2)
                    ProgressView().tint(theme.ink2)
                    Text("Writing today's brief.").liType(.sub).foregroundColor(theme.ink2)
                }
            }
        } else {
            LICard(feature: true) {
                LIEmptyState(title: "No brief yet", message: "It could not be written just now.", actionTitle: "Write it now") {
                    Task { await write(.morning) }
                }
            }
        }
    }

    private func regenerateButton(_ kind: CoachNoteKind, title: String) -> some View {
        Button(action: {
            LIHaptics.tap()
            Task { await write(kind) }
        }) {
            HStack(spacing: 6) {
                if writing == kind {
                    ProgressView().tint(theme.ink2).scaleEffect(0.8)
                } else {
                    Image(systemName: "arrow.clockwise").font(.system(size: 13, weight: .regular))
                }
                Text(title).liType(.sub)
            }
            .foregroundColor(theme.ink2)
            .frame(minHeight: 44)
        }
        .buttonStyle(LIPressStyle())
        .disabled(writing != nil)
    }

    private var flagsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Flags", trailing: flags.isEmpty ? nil : "\(flags.count) active").padding(.top, 28)
            if flags.isEmpty {
                LICard {
                    Text("Nothing flagged. A pattern needs a few days of data.").liType(.sub).foregroundColor(theme.ink2)
                }
            } else {
                ForEach(Array(flags.enumerated()), id: \.offset) { _, f in
                    FlagCard(flag: f.flag.flag) {
                        LIHaptics.tap()
                        Task {
                            do { try await store.dismissCoachFlag(f.note) } catch { problem = "Could not dismiss that." }
                            await load(quiet: true)
                        }
                    }
                }
            }
        }
    }

    private var weeklySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("Sunday review", trailing: weekly.map { weekLabel($0.date) }).padding(.top, 28)
            if let w = weekly {
                LICard {
                    VStack(alignment: .leading, spacing: 14) {
                        NoteText(text: w.body)
                        HStack {
                            SourceLine(source: w.source)
                            Spacer()
                            if due != nil {
                                regenerateButton(.weekly, title: reviewMissing ? "Write this week" : "Rewrite")
                            }
                        }
                    }
                }
            } else {
                LICard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(sundayToday ? "This week's review is ready" : "First review lands \(LIDate.formatDateLong(CoachChat.nextReviewDate(today)))")
                            .liType(.h2).foregroundColor(theme.ink)
                        Text(sundayToday ? "It writes itself at 8:00 PM." : "What held, what slipped, one change.")
                            .liType(.sub).foregroundColor(theme.ink2)
                        if due != nil {
                            LISecondaryButton(writing == .weekly ? "Writing" : "Write it now") { Task { await write(.weekly) } }
                                .disabled(writing != nil)
                        }
                    }
                }
            }
        }
    }

    private var sundayToday: Bool { due?.weekEnd == today }
    private var reviewMissing: Bool {
        guard let d = due, let w = weekly else { return false }
        return w.date != d.weekEnd
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            LISectionLabel("History", trailing: history.isEmpty ? nil : "\(history.count)").padding(.top, 28)
            if history.isEmpty {
                LICard {
                    Text("No past notes. Earlier briefs, reviews and cleared flags collect here.").liType(.sub).foregroundColor(theme.ink2)
                }
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(history.prefix(40).enumerated()), id: \.element.id) { i, n in
                        if i > 0 { LIHairline() }
                        let t = historyTitle(n)
                        Button(action: {
                            LIHaptics.tap()
                            openNote = n
                        }) {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.title).liType(.body).foregroundColor(theme.ink)
                                    Text(t.sub).liType(.caption).foregroundColor(theme.ink2)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.system(size: 13)).foregroundColor(theme.ink3)
                            }
                            .padding(.horizontal, 18)
                            .frame(minHeight: 56)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(LIPressStyle())
                    }
                }
                .background(LITileSurface(radius: 24))
            }
        }
    }

    private func historyTitle(_ n: CoachNote) -> (title: String, sub: String) {
        switch n.kind {
        case .morning: return ("Morning brief", LIDate.formatDateLong(n.date))
        case .weekly: return ("Sunday review", weekLabel(n.date))
        case .flag:
            let f = CoachChat.parseFlagNote(n.body)
            var state = "Flag"
            if let r = f?.resolvedOn { state = "Cleared \(LIDate.formatDateShort(r))" } else if let d = f?.dismissedOn { state = "Dismissed \(LIDate.formatDateShort(d))" }
            return (f?.flag.title ?? "Flag", "\(state), flagged \(LIDate.formatDateShort(n.date))")
        }
    }

    // MARK: loading and writing

    private func load(quiet: Bool = false) async {
        if !quiet { problem = nil }
        today = LIDate.todayNY()
        do {
            notes = try await store.loadCoachNotes()
            loading = false
        } catch {
            loading = false
            problem = (error as? APIError)?.errorDescription ?? "Could not load the notes."
            return
        }
        if quiet { return }
        // Write the brief and the review when they are missing. Talks to the coach only when something is.
        if !phaseBefore && (brief == nil || (due != nil && weekly?.date != due?.weekEnd && due?.auto == true)) {
            writing = brief == nil ? .morning : .weekly
            do {
                try await store.syncCoachNotes()
                notes = try await store.loadCoachNotes()
            } catch {
                problem = (error as? LocalizedError)?.errorDescription ?? "The coach could not write just now."
            }
            writing = nil
        }
    }

    private func write(_ kind: CoachNoteKind) async {
        if writing != nil { return }
        writing = kind
        problem = nil
        do {
            try await store.syncCoachNotes(regenerate: kind == .morning, weekly: kind == .weekly)
            notes = try await store.loadCoachNotes()
            LIHaptics.check()
        } catch {
            problem = (error as? LocalizedError)?.errorDescription ?? "The coach could not write just now."
            LIHaptics.error()
        }
        writing = nil
    }
}

fileprivate func weekLabel(_ sunday: DateStr) -> String {
    return "\(LIDate.formatDateShort(LIDate.weekStart(sunday))) to \(LIDate.formatDateShort(sunday))"
}

// MARK: pieces

private struct NoteText: View {
    @Environment(\.liTheme) private var theme
    let text: String

    var body: some View {
        let paragraphs = text.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, p in
                Text(p).liType(.body).foregroundColor(theme.ink).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct SourceLine: View {
    @Environment(\.liTheme) private var theme
    let source: NoteSource

    var body: some View {
        Text(source == .ai ? "Written by Claude from your data" : "Written by rules from your data")
            .liType(.caption)
            .foregroundColor(theme.ink2)
    }
}

private struct FlagCard: View {
    @Environment(\.liTheme) private var theme
    let flag: CoachFlag
    let onDismiss: (() -> Void)?

    init(flag: CoachFlag, onDismiss: (() -> Void)? = nil) {
        self.flag = flag
        self.onDismiss = onDismiss
    }

    var body: some View {
        LICard {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    HStack(spacing: 8) {
                        Circle().fill(theme.warn).frame(width: 6, height: 6)
                        Text("Since \(LIDate.formatDateShort(flag.since))").liType(.label).foregroundColor(theme.ink2)
                    }
                    Spacer()
                    if let onDismiss = onDismiss {
                        Button(action: onDismiss) {
                            Image(systemName: "xmark").font(.system(size: 14, weight: .regular)).foregroundColor(theme.ink2).frame(width: 44, height: 44)
                        }
                        .buttonStyle(LIPressStyle())
                        .padding(.top, -12)
                        .padding(.trailing, -12)
                        .accessibilityLabel("Dismiss flag: \(flag.title)")
                    }
                }
                Text(flag.title).liType(.h2).foregroundColor(theme.ink)
                FlagDetail(flag: flag)
            }
        }
    }
}

private struct FlagDetail: View {
    @Environment(\.liTheme) private var theme
    let flag: CoachFlag

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(flag.detail).liType(.sub).foregroundColor(theme.ink2)
            if !flag.evidence.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(flag.evidence.enumerated()), id: \.offset) { i, e in
                        if i > 0 { LIHairline() }
                        HStack {
                            Text(e.label).liType(.sub).foregroundColor(theme.ink2)
                            Spacer()
                            Text(e.value).liType(.sub).foregroundColor(theme.ink)
                        }
                        .padding(.vertical, 10)
                    }
                }
            }
            if !flag.change.isEmpty {
                Text(flag.change).liType(.body).foregroundColor(theme.ink)
            }
        }
    }
}

/// An older note, read in full.
private struct NoteSheet: View {
    @Environment(\.liTheme) private var theme
    let note: CoachNote

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if note.kind == .flag, let f = CoachChat.parseFlagNote(note.body) {
                    Text(f.flag.title).liType(.h1).foregroundColor(theme.ink)
                    FlagDetail(flag: f.flag)
                } else {
                    Text(note.kind == .weekly ? "Sunday review" : "Morning brief").liType(.label).foregroundColor(theme.ink2)
                    Text(note.kind == .weekly ? weekLabel(note.date) : LIDate.formatDateLong(note.date)).liType(.h1).foregroundColor(theme.ink)
                    NoteText(text: note.body)
                    SourceLine(source: note.source)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
