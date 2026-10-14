import SwiftUI
import LockInKit

/// What to say when nothing comes to mind. One tap sends it.
private let starters: [(label: String, text: String)] = [
    ("Sore", "I'm sore from the workout."),
    ("Urge", "I have an urge right now."),
    ("Not feeling it", "I don't feel like doing it today."),
    ("Tired", "I'm tired."),
    ("Slipped", "I slipped."),
]

/// The coach chat. Opens from any tab as a sheet.
struct CoachView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss
    @State private var model = CoachChatModel()
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            LIBackground()
            content
        }
        .navigationTitle("Coach")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink(destination: CoachNotesView()) {
                    Text("Notes").liType(.body)
                }
            }
            ToolbarItem(placement: .principal) {
                VStack(spacing: 0) {
                    Text("Coach").liType(.body).foregroundColor(theme.ink)
                    Text(CoachChat.voiceLabel(model.voice)).liType(.caption).foregroundColor(theme.ink2)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
        .task { await model.load(store) }
    }

    @ViewBuilder
    private var content: some View {
        if model.loading {
            ProgressView().tint(theme.ink2)
        } else if let message = model.loadError {
            VStack(spacing: 12) {
                LIEmptyState(title: "Could not open the chat", message: message, actionTitle: "Try again") {
                    model.loading = true
                    Task { await model.load(store) }
                }
            }
        } else {
            thread
                .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        }
    }

    // MARK: thread

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if model.messages.isEmpty {
                        LIEmptyState(title: "Say anything", message: "Ask for a push, a plan, or tell it how the day is going.")
                            .padding(.top, 60)
                    }
                    ForEach(Array(model.messages.enumerated()), id: \.element.id) { index, m in
                        if index == 0 || model.messages[index - 1].date != m.date {
                            Text(dayLabel(m.date))
                                .liType(.label)
                                .foregroundColor(theme.ink2)
                                .frame(maxWidth: .infinity)
                                .padding(.top, index == 0 ? 0 : 14)
                        }
                        CoachBubble(message: m, isNew: model.fresh.contains(m.id))
                            .id(m.id)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                    if model.thinking {
                        TypingBubble().id("typing")
                    }
                    if let problem = model.sendError {
                        LINotice(problem, warn: true, actionTitle: "Try again") {
                            Task { await model.reply(store) }
                        }
                        .id("problem")
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: model.messages.count) { _, _ in scrollEnd(proxy) }
            .onChange(of: model.thinking) { _, _ in scrollEnd(proxy) }
            .onChange(of: model.sendError) { _, _ in scrollEnd(proxy) }
            .onChange(of: focused) { _, _ in scrollEnd(proxy, delay: 0.25) }
            .onAppear { scrollEnd(proxy, animated: false) }
        }
    }

    private func scrollEnd(_ proxy: ScrollViewProxy, animated: Bool = true, delay: Double = 0) {
        let go = {
            if animated {
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("bottom", anchor: .bottom) }
            } else {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
        if delay > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { go() }
        } else {
            DispatchQueue.main.async { go() }
        }
    }

    private func dayLabel(_ date: DateStr) -> String {
        if date == model.today { return "Today" }
        if date == LIDate.addDays(model.today, -1) { return "Yesterday" }
        return LIDate.formatDateLong(date)
    }

    // MARK: composer

    private var canSend: Bool {
        return !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !model.thinking
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if draft.isEmpty && !model.thinking {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(starters, id: \.label) { s in
                            LIChip(s.label, on: false) { submit(s.text) }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .liType(.body)
                    .foregroundColor(theme.ink)
                    .focused($focused)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: 24, style: .continuous).fill(theme.tile))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(theme.tileLine, lineWidth: 1))
                    .onChange(of: draft) { _, value in
                        if value.count > CoachChat.maxMessage { draft = String(value.prefix(CoachChat.maxMessage)) }
                    }
                Button(action: { submit(draft) }) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundColor(theme.accentInk)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(theme.gradient))
                        .opacity(canSend ? 1 : 0.35)
                }
                .buttonStyle(LIPressStyle())
                .disabled(!canSend)
                .accessibilityLabel("Send")
            }
            .padding(.horizontal, 16)
        }
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(theme.bg.opacity(0.92).ignoresSafeArea(edges: .bottom))
    }

    private func submit(_ text: String) {
        let sending = text
        if model.thinking { return }
        LIHaptics.tap()
        draft = ""
        Task {
            let ok = await model.send(store, text: sending)
            if !ok && draft.isEmpty { draft = sending }
        }
    }
}

// MARK: pieces

private struct BubbleShape {
    static func mine() -> UnevenRoundedRectangle {
        return UnevenRoundedRectangle(cornerRadii: RectangleCornerRadii(topLeading: 20, bottomLeading: 20, bottomTrailing: 8, topTrailing: 20), style: .continuous)
    }
    static func theirs() -> UnevenRoundedRectangle {
        return UnevenRoundedRectangle(cornerRadii: RectangleCornerRadii(topLeading: 20, bottomLeading: 8, bottomTrailing: 20, topTrailing: 20), style: .continuous)
    }
}

private struct CoachBubble: View {
    @Environment(\.liTheme) private var theme
    let message: CoachMessage
    let isNew: Bool

    var body: some View {
        if message.sender == .me {
            HStack {
                Spacer(minLength: 56)
                Text(message.body)
                    .liType(.body)
                    .foregroundColor(theme.bg)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .background(BubbleShape.mine().fill(theme.ink))
            }
        } else {
            HStack {
                VStack(alignment: .leading, spacing: 8) {
                    if message.trigger != .chat {
                        HStack(spacing: 8) {
                            if isNew { Circle().fill(theme.warn).frame(width: 6, height: 6) }
                            Text(checkinLabel(message.trigger)).liType(.label).foregroundColor(theme.ink2)
                        }
                    }
                    CoachBodyText(text: message.body)
                    if let id = libraryId(message.quote) {
                        NavigationLink(destination: LibraryQuoteRoute(quoteId: id)) {
                            Text("Read it in the Library")
                                .liType(.caption)
                                .foregroundColor(theme.accent)
                                .underline()
                                .frame(minHeight: 44, alignment: .leading)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(BubbleShape.theirs().fill(theme.tile))
                .overlay(BubbleShape.theirs().strokeBorder(theme.tileLine, lineWidth: 1))
                Spacer(minLength: 40)
            }
        }
    }

    private func checkinLabel(_ t: CoachTrigger) -> String {
        switch t {
        case .postWorkout: return "After the workout"
        case .slip: return "After a slip"
        case .missedItem: return "Yesterday"
        case .chat: return ""
        }
    }

    private func libraryId(_ key: String?) -> String? {
        guard let key = key, key.hasPrefix("lib:"), key.count > 4 else { return nil }
        return String(key.dropFirst(4))
    }
}

/// A coach message. A line that is a quote is set apart: the line, then the name small under it.
private struct CoachBodyText: View {
    @Environment(\.liTheme) private var theme
    let text: String

    private struct Line: Identifiable {
        let id: Int
        let text: String
        let quote: String?
        let by: String?
    }

    private var lines: [Line] {
        let parts = text.split(whereSeparator: { $0 == "\n" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let pattern = try? NSRegularExpression(pattern: "^\"(.+)\"\\s*(.*?)\\.?$")
        var out: [Line] = []
        for (i, p) in parts.enumerated() {
            let ns = p as NSString
            if let re = pattern, let m = re.firstMatch(in: p, range: NSRange(location: 0, length: ns.length)), m.numberOfRanges >= 3 {
                let q = ns.substring(with: m.range(at: 1))
                let by = ns.substring(with: m.range(at: 2))
                if by.count <= 40 {
                    out.append(Line(id: i, text: p, quote: q, by: by.isEmpty ? nil : by))
                    continue
                }
            }
            out.append(Line(id: i, text: p, quote: nil, by: nil))
        }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(lines) { line in
                if let q = line.quote {
                    HStack(alignment: .top, spacing: 12) {
                        Rectangle().fill(theme.accent).frame(width: 1)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(q).font(LIFont.medium(17)).foregroundColor(theme.ink).fixedSize(horizontal: false, vertical: true)
                            if let by = line.by {
                                Text(by).liType(.caption).foregroundColor(theme.ink2)
                            }
                        }
                    }
                } else {
                    Text(line.text).liType(.body).foregroundColor(theme.ink).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

private struct TypingBubble: View {
    @Environment(\.liTheme) private var theme
    @State private var phase = false

    var body: some View {
        HStack {
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(theme.ink2)
                        .frame(width: 6, height: 6)
                        .opacity(phase ? 1 : 0.3)
                        .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true).delay(Double(i) * 0.16), value: phase)
                }
            }
            .padding(.horizontal, 18)
            .frame(height: 44)
            .background(BubbleShape.theirs().fill(theme.tile))
            .overlay(BubbleShape.theirs().strokeBorder(theme.tileLine, lineWidth: 1))
            Spacer()
        }
        .onAppear { phase = true }
        .accessibilityLabel("The coach is writing")
    }
}
