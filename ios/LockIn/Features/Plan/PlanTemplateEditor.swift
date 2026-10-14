import SwiftUI
import LockInKit

/// The weekly template: blocks for each weekday. Days follow it until they are edited on their own.
struct PlanTemplateEditor: View {
    @Environment(AppStore.self) private var store
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let initial: [ScheduleTemplate]
    let startWeekday: Int
    let onChanged: () -> Void

    @State private var rows: [ScheduleTemplate] = []
    @State private var weekday = 1
    @State private var editing: ScheduleTemplate? = nil
    @State private var adding = false
    @State private var error: String? = nil
    @State private var ready = false

    private static let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    private static let short = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    private var dayRows: [ScheduleTemplate] {
        return rows.filter { $0.weekday == weekday }.sorted { LIDate.minutesOf($0.start) < LIDate.minutesOf($1.start) }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("The weekly plan. A day follows it until you change that day.")
                            .liType(.sub).foregroundColor(theme.ink2)
                        weekdayRow
                        if let error = error {
                            LINotice(error, actionTitle: "Dismiss") { self.error = nil }
                        }
                        if dayRows.isEmpty {
                            LICard { LIEmptyState(title: "Nothing planned", message: "No blocks for \(PlanTemplateEditor.names[weekday]) yet.") }
                        } else {
                            VStack(spacing: 0) {
                                ForEach(Array(dayRows.enumerated()), id: \.element.id) { index, row in
                                    if index > 0 { LIHairline() }
                                    rowView(row)
                                }
                            }
                            .background(LITileSurface(radius: 20))
                        }
                        LIPrimaryButton("Add a block") { adding = true }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Weekly plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
        .onAppear {
            if ready { return }
            ready = true
            rows = initial
            weekday = startWeekday
        }
        .sheet(item: $editing) { row in
            PlanTemplateRowSheet(weekday: row.weekday, existing: row) { saved in
                editing = nil
                apply(saved, existing: row)
            } onDelete: {
                editing = nil
                remove(row)
            }
            .liSheetStyle()
        }
        .sheet(isPresented: $adding) {
            PlanTemplateRowSheet(weekday: weekday, existing: nil) { saved in
                adding = false
                apply(saved, existing: nil)
            } onDelete: {
                adding = false
            }
            .liSheetStyle()
        }
    }

    private var weekdayRow: some View {
        HStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { d in
                let day = (d + 1) % 7
                Button {
                    LIHaptics.tap()
                    weekday = day
                } label: {
                    Text(PlanTemplateEditor.short[day])
                        .liType(.sub)
                        .foregroundColor(weekday == day ? theme.bg : theme.ink)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Capsule().fill(weekday == day ? theme.ink : theme.tile))
                }
                .buttonStyle(LIPressStyle())
                .accessibilityLabel(PlanTemplateEditor.names[day])
            }
        }
    }

    private func rowView(_ row: ScheduleTemplate) -> some View {
        Button {
            LIHaptics.tap()
            editing = row
        } label: {
            HStack(spacing: 12) {
                Image(systemName: row.kind.symbol).font(.system(size: 15)).foregroundColor(theme.ink2).frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.blockName).liType(.body).foregroundColor(theme.ink).lineLimit(1)
                    Text("\(LIDate.formatTime(row.start)) to \(LIDate.formatTime(row.end))\(row.flexible ? "" : ", fixed")")
                        .liType(.caption).foregroundColor(theme.ink2)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.ink3)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(LIPressStyle())
    }

    private func apply(_ draft: PlanTemplateDraft, existing: ScheduleTemplate?) {
        let row = AppStore.templateRow(weekday: draft.weekday, blockName: draft.name, start: draft.start, end: draft.end, kind: draft.kind, flexible: draft.flexible, note: existing?.note)
        Task {
            do {
                if let old = existing {
                    let saved = try await store.planUpdateTemplate(id: old.id, patch: row)
                    if let i = rows.firstIndex(where: { $0.id == old.id }) { rows[i] = saved }
                } else {
                    rows.append(try await store.planAddTemplate(row))
                }
                onChanged()
            } catch {
                self.error = PlanErrorText.text(error)
            }
        }
    }

    private func remove(_ row: ScheduleTemplate) {
        Task {
            do {
                try await store.planRemoveTemplate(id: row.id)
                rows.removeAll { $0.id == row.id }
                LIHaptics.uncheck()
                onChanged()
            } catch {
                self.error = PlanErrorText.text(error)
            }
        }
    }
}

struct PlanTemplateDraft {
    var weekday: Int
    var name: String
    var start: TimeStr
    var end: TimeStr
    var kind: BlockKind
    var flexible: Bool
}

struct PlanTemplateRowSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    let weekday: Int
    let existing: ScheduleTemplate?
    let onSave: (PlanTemplateDraft) -> Void
    let onDelete: () -> Void

    @State private var name = ""
    @State private var start: TimeStr = "09:00"
    @State private var end: TimeStr = "10:00"
    @State private var kind: BlockKind = .other
    @State private var flexible = true
    @State private var ready = false

    private var valid: Bool {
        return !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && start != end
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        PlanTextField(label: "Name", placeholder: "Study, gym, class", text: $name)
                        HStack(spacing: 12) {
                            PlanTimeField(label: "Start", time: $start)
                            PlanTimeField(label: "End", time: $end)
                        }
                        PlanToggleRow(title: "Flexible", sub: flexible ? "Shifts later when something runs long" : "Fixed. Never moves on its own", isOn: $flexible)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Kind").liType(.label).foregroundColor(theme.ink2)
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(BlockKind.pickable, id: \.rawValue) { k in
                                        LIChip(k.label, on: kind == k) { kind = k }
                                    }
                                }
                            }
                        }
                        HStack(spacing: 12) {
                            if existing != nil {
                                Button {
                                    dismiss()
                                    onDelete()
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
                                let t = name.trimmingCharacters(in: .whitespacesAndNewlines)
                                dismiss()
                                onSave(PlanTemplateDraft(weekday: weekday, name: t, start: start, end: end, kind: kind, flexible: flexible))
                            }
                            .disabled(!valid)
                            .opacity(valid ? 1 : 0.5)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(existing == nil ? "New block" : "Edit block")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } }
            }
        }
        .onAppear {
            if ready { return }
            ready = true
            if let e = existing {
                name = e.blockName
                start = e.start
                end = e.end
                kind = e.kind
                flexible = e.flexible
            }
        }
    }
}
