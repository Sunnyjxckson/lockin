import SwiftUI
import LockInKit

/// A time of day picker that reads and writes "HH:mm" strings, in New York terms, whatever the phone's zone is.
struct PlanTimeField: View {
    @Environment(\.liTheme) private var theme
    let label: String
    @Binding var time: TimeStr
    var disabled: Bool = false

    private static var reference: Date {
        var c = DateComponents()
        c.year = 2001
        c.month = 1
        c.day = 1
        return Calendar.current.date(from: c) ?? Date(timeIntervalSince1970: 978_307_200)
    }

    private var binding: Binding<Date> {
        Binding<Date>(
            get: {
                let minutes = LIDate.minutesOf(time)
                return Calendar.current.date(byAdding: .minute, value: minutes, to: PlanTimeField.reference) ?? PlanTimeField.reference
            },
            set: { picked in
                let comps = Calendar.current.dateComponents([.hour, .minute], from: picked)
                time = LIDate.timeFromMinutes((comps.hour ?? 0) * 60 + (comps.minute ?? 0))
            }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).liType(.label).foregroundColor(theme.ink2)
            DatePicker(label, selection: binding, displayedComponents: .hourAndMinute)
                .labelsHidden()
                .datePickerStyle(.compact)
                .disabled(disabled)
                .tint(theme.accent)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .padding(.horizontal, 12)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
        }
    }
}

/// A one line text field in the app's style.
struct PlanTextField: View {
    @Environment(\.liTheme) private var theme
    let label: String
    let placeholder: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !label.isEmpty {
                Text(label).liType(.label).foregroundColor(theme.ink2)
            }
            TextField(placeholder, text: $text)
                .liType(.body)
                .foregroundColor(theme.ink)
                .tint(theme.accent)
                .submitLabel(.done)
                .padding(.horizontal, 16)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
        }
    }
}

/// A switch row: title, one line of help, a toggle.
struct PlanToggleRow: View {
    @Environment(\.liTheme) private var theme
    let title: String
    let sub: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).liType(.body).foregroundColor(theme.ink)
                Text(sub).liType(.caption).foregroundColor(theme.ink2)
            }
        }
        .tint(theme.accent)
        .frame(minHeight: 48)
    }
}

// MARK: add

struct PlanAddSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let date: DateStr
    let blocks: [DayBlock]
    /// Minutes since midnight when the day is today, else nil.
    let nowMin: Int?
    /// Set when an empty spot on the timeline was tapped.
    let startAt: Int?
    let onAdd: (DayBlock) -> Void

    @State private var name = ""
    @State private var minutes = 60
    @State private var pick = false
    @State private var time: TimeStr = "12:00"
    @State private var flexible = true
    @State private var ready = false

    private var from: Int {
        if let n = nowMin { return n }
        let starts = blocks.map { PlanRules.spanOf($0).s }
        return starts.min() ?? 6 * 60
    }

    private var slot: OpenSlot? {
        return PlanRules.nextOpenSlot(blocks.map { $0 as TimedBlock }, duration: minutes, from: from)
    }

    private var startMin: Int? {
        return pick ? LIDate.minutesOf(time) : slot?.startMin
    }

    private var endMin: Int? {
        guard let s = startMin else { return nil }
        return min(PlanRules.dayEnd, s + minutes)
    }

    private var clash: [DayBlock] {
        guard pick, let s = startMin else { return [] }
        let probe = PlainTimed(start: LIDate.timeFromMinutes(s), duration: minutes)
        return blocks.filter { PlanRules.overlapMinutes($0, probe) > 0 }
    }

    private var label: String {
        let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? "Block" : t
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        nameSection
                        lengthSection
                        whenSection
                        slotCard
                        PlanToggleRow(title: "Flexible", sub: "Shifts later when something runs long", isOn: $flexible)
                        LIPrimaryButton(startMin == nil ? "No open slot" : "Add at \(LIDate.formatTime(LIDate.timeFromMinutes(startMin ?? 0)))") { add() }
                            .disabled(startMin == nil)
                            .opacity(startMin == nil ? 0.5 : 1)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Add to the day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } }
            }
        }
        .onAppear {
            if ready { return }
            ready = true
            if let at = startAt {
                pick = true
                time = LIDate.timeFromMinutes(at)
            } else {
                let base = ((nowMin ?? 12 * 60) + 14) / 15 * 15
                time = LIDate.timeFromMinutes(min(PlanRules.dayEnd - 60, base))
            }
        }
    }

    private var nameSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            PlanTextField(label: "What", placeholder: "TV, haircut, call home", text: $name)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(0..<PlanRules.freePresets.count, id: \.self) { i in
                        let p = PlanRules.freePresets[i]
                        LIChip(p.name, on: name == p.name) {
                            name = p.name
                            minutes = p.minutes
                        }
                    }
                }
            }
        }
    }

    private var lengthSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("How long").liType(.label).foregroundColor(theme.ink2)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(PlanRules.lengthChoices, id: \.self) { m in
                        LIChip(LIDate.formatDuration(m), on: minutes == m) { minutes = m }
                    }
                }
            }
            Stepper(value: $minutes, in: 5...720, step: 5) {
                Text("\(minutes) min").liType(.body).foregroundColor(theme.ink)
            }
        }
    }

    private var whenSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("When").liType(.label).foregroundColor(theme.ink2)
            LISegmentedControl(options: [(value: false, title: "Next open slot"), (value: true, title: "Pick a time")], selection: $pick)
            if pick {
                PlanTimeField(label: "Start", time: $time)
            }
        }
    }

    private var slotCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let s = startMin, let e = endMin {
                Text(pick ? "Goes at" : (nowMin != nil ? "Next open slot" : "First open slot"))
                    .liType(.label).foregroundColor(theme.ink2)
                HStack(alignment: .firstTextBaseline) {
                    Text(LIDate.formatTime(LIDate.timeFromMinutes(s))).liType(.num).foregroundColor(theme.ink)
                    Spacer()
                    Text("to \(LIDate.formatTime(LIDate.timeFromMinutes(e))), \(LIDate.formatDuration(e - s))")
                        .liType(.sub).foregroundColor(theme.ink2)
                }
                if !clash.isEmpty {
                    Text("Overlaps \(clash.map { $0.blockName }.joined(separator: ", ")). Flagged, not moved.")
                        .liType(.sub).foregroundColor(theme.warn)
                }
            } else {
                Text("No open slot").liType(.label).foregroundColor(theme.ink2)
                Text("Nothing open for \(LIDate.formatDuration(minutes)). Make it shorter or pick a time.")
                    .liType(.sub).foregroundColor(theme.ink2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
    }

    private func add() {
        guard let s = startMin else { return }
        LIHaptics.check()
        let block = PlanRules.makeBlock(id: PlanModel.draftId(), date: date, name: label, startMin: s, duration: minutes, flexible: flexible, kind: BlockKind.guess(fromName: label))
        dismiss()
        onAdd(block)
    }
}

// MARK: edit

struct PlanBlockSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let block: DayBlock
    let blocks: [DayBlock]
    /// True when the clock is inside this block right now.
    let live: Bool
    /// Imported from a calendar that cannot be written: times follow Google.
    let locked: Bool
    let onSave: (ShiftResult) -> Void
    let onDelete: (DayBlock) -> Void
    let onStillGoing: (DayBlock) -> Void

    @State private var name = ""
    @State private var start: TimeStr = "00:00"
    @State private var end: TimeStr = "00:00"
    @State private var flexible = true
    @State private var kind: BlockKind = .other
    @State private var ready = false

    private var fromCalendar: Bool { return block.source == .calendar }

    private var s: Int { return LIDate.minutesOf(start) }
    private var e: Int {
        let raw = LIDate.minutesOf(end)
        return raw <= s ? PlanRules.dayEnd : raw
    }
    private var length: Int { return e - s }

    private var result: ShiftResult {
        return PlanRules.updateBlock(blocks, id: block.id, patch: BlockPatch(blockName: name, start: start, end: end, flexible: flexible, kind: kind))
    }

    private var dirty: Bool {
        let span = PlanRules.spanOf(block)
        return name.trimmingCharacters(in: .whitespacesAndNewlines) != block.blockName || s != span.s || e != span.e || flexible != block.flexible || kind != block.kind
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text(fromCalendar ? "From Google Calendar. Changes go back to Google." : "This day only. The template stays as it is.")
                            .liType(.sub).foregroundColor(theme.ink2)
                        PlanTextField(label: "Name", placeholder: "Name", text: $name)
                        timesSection
                        previewCard
                        PlanToggleRow(title: "Flexible", sub: flexible ? "Shifts later when something runs long" : "Fixed. Never moves on its own", isOn: $flexible)
                        if !fromCalendar { kindSection }
                        if live && !locked {
                            LISecondaryButton("Still going, add 15 minutes") {
                                dismiss()
                                onStillGoing(block)
                            }
                        }
                        actions
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Edit block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } }
            }
        }
        .onAppear {
            if ready { return }
            ready = true
            name = block.blockName
            start = block.start
            end = block.end
            flexible = block.flexible
            kind = block.kind
        }
    }

    private var timesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                PlanTimeField(label: "Start", time: $start, disabled: locked)
                PlanTimeField(label: "End", time: $end, disabled: locked)
            }
            if locked {
                Text("Read only. Change the time in Google Calendar.").liType(.sub).foregroundColor(theme.ink2)
            } else {
                HStack(spacing: 12) {
                    stepper("Move", LIDate.formatTime(start), minus: { nudgeStart(-15) }, plus: { nudgeStart(15) })
                    stepper("Length", LIDate.formatDuration(length), minus: { nudgeLength(-15) }, plus: { nudgeLength(15) })
                }
            }
        }
    }

    private func stepper(_ label: String, _ value: String, minus: @escaping () -> Void, plus: @escaping () -> Void) -> some View {
        HStack(spacing: 0) {
            Button(action: minus) {
                Image(systemName: "minus").frame(width: 44, height: 52)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("\(label) smaller")
            VStack(spacing: 4) {
                Text(label).liType(.label).foregroundColor(theme.ink2)
                Text(value).liType(.sub).foregroundColor(theme.ink)
            }
            .frame(maxWidth: .infinity)
            Button(action: plus) {
                Image(systemName: "plus").frame(width: 44, height: 52)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("\(label) larger")
        }
        .foregroundColor(theme.ink2)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.tile))
    }

    private func clock(_ minutes: Int) -> TimeStr {
        return minutes >= PlanRules.dayEnd ? "00:00" : LIDate.timeFromMinutes(minutes)
    }

    private func nudgeStart(_ delta: Int) {
        let len = length
        let ns = max(0, min(PlanRules.dayEnd - len, s + delta))
        LIHaptics.tap()
        start = clock(ns)
        end = clock(ns + len)
    }

    private func nudgeLength(_ delta: Int) {
        let ne = max(s + PlanRules.minBlock, min(PlanRules.dayEnd, e + delta))
        LIHaptics.tap()
        end = clock(ne)
    }

    @ViewBuilder
    private var previewCard: some View {
        let r = result
        if !r.moved.isEmpty || !r.conflicts.isEmpty {
            let names = Dictionary(blocks.map { ($0.id, $0.blockName) }, uniquingKeysWith: { first, _ in first })
            VStack(alignment: .leading, spacing: 8) {
                if !r.moved.isEmpty {
                    Text("Shifts after saving").liType(.label).foregroundColor(theme.ink2)
                    ForEach(r.moved, id: \.id) { m in
                        HStack(alignment: .firstTextBaseline) {
                            Text(m.name).liType(.sub).foregroundColor(theme.ink).lineLimit(1)
                            Spacer(minLength: 8)
                            Text("\(LIDate.formatTime(m.to.start)) to \(LIDate.formatTime(m.to.end))" + (m.cut > 0 ? ", cut \(LIDate.formatDuration(m.cut))" : ""))
                                .liType(.sub).foregroundColor(theme.ink2)
                        }
                    }
                }
                ForEach(r.conflicts, id: \.id) { c in
                    Text("\(names[c.id] ?? "This") would overlap \(names[c.withId] ?? "a fixed block") by \(LIDate.formatDuration(c.minutes)).")
                        .liType(.sub).foregroundColor(theme.warn)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.tile))
        }
    }

    private var kindSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Kind").liType(.label).foregroundColor(theme.ink2)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(BlockKind.pickable, id: \.rawValue) { k in
                        LIChip(k.label, on: kind == k) { kind = k }
                    }
                }
            }
            Text("Free time gets a countdown.").liType(.caption).foregroundColor(theme.ink2)
        }
    }

    private var actions: some View {
        HStack(spacing: 12) {
            if !fromCalendar {
                Button {
                    LIHaptics.uncheck()
                    dismiss()
                    onDelete(block)
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 18))
                        .foregroundColor(theme.danger)
                        .frame(width: 56, height: 52)
                        .background(Capsule().fill(theme.dangerSoft))
                }
                .buttonStyle(LIPressStyle())
                .accessibilityLabel("Delete block")
            }
            LIPrimaryButton("Save") {
                dismiss()
                onSave(result)
            }
            .disabled(!dirty)
            .opacity(dirty ? 1 : 0.5)
        }
    }
}
