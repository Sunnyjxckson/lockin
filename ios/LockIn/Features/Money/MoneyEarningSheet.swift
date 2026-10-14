import SwiftUI
import LockInKit

private enum MoneyReadState: Equatable {
    case none
    case reading
    case filled
    case fallback
}

/// Add or edit one earning. A screenshot is read by the server and prefills the form, which stays editable before saving.
struct MoneyEarningSheet: View {
    @Environment(\.liTheme) private var theme

    let model: MoneyModel
    let editing: Earning?
    let prefill: Data?
    let today: DateStr
    let isLocked: (DateStr) -> Bool
    let onClose: (String?) -> Void

    @State private var amount: Double?
    @State private var app: String
    @State private var hours: Double?
    @State private var date: DateStr
    @State private var showDate: Bool
    @State private var shot: Data? = nil
    @State private var keptRef: String?
    @State private var read: MoneyReadState = .none
    @State private var readToken = 0
    @State private var saving = false
    @State private var confirmDelete = false
    @State private var errorText: String? = nil
    @State private var camera = false
    @State private var library = false
    @State private var started = false

    init(model: MoneyModel, editing: Earning?, prefill: Data?, today: DateStr, defaultApp: String, isLocked: @escaping (DateStr) -> Bool, onClose: @escaping (String?) -> Void) {
        self.model = model
        self.editing = editing
        self.prefill = prefill
        self.today = today
        self.isLocked = isLocked
        self.onClose = onClose
        _amount = State(initialValue: editing?.amount)
        _app = State(initialValue: editing != nil ? Money.appChoice(editing?.app) : defaultApp)
        _hours = State(initialValue: editing?.hours)
        _date = State(initialValue: editing?.date ?? today)
        _showDate = State(initialValue: editing != nil)
        _keptRef = State(initialValue: editing?.screenshotUrl)
    }

    private let hourChips: [Double] = [1, 1.5, 2, 3, 4, 5]

    // MARK: rules

    private var locked: Bool { return isLocked(date) }
    private var wasLocked: Bool {
        guard let e = editing else { return false }
        return isLocked(e.date)
    }
    private var future: Bool { return date > today }
    private var valid: Bool {
        return (amount ?? 0) > 0 && !locked && !wasLocked && !future
    }

    // MARK: body

    var body: some View {
        MBSheet(title: editing == nil ? "Add earnings" : "Edit entry") {
            if shot != nil || (keptRef ?? "").isEmpty == false || read != .none {
                screenshotCard
            }
            MBNumberField(prefix: "$", hero: true, maxValue: 99999, autofocus: editing == nil && prefill == nil, value: $amount)
            LISegmentedControl(options: Money.apps.map { (value: $0, title: $0) }, selection: $app)
            hoursSection
            daySection
            if let errorText = errorText {
                Text(errorText).liType(.sub).foregroundColor(theme.warn)
            }
        } footer: {
            footer
        }
        .mbPhotoSources(camera: $camera, library: $library, maxSize: 1400) { data in
            attach(data)
        }
        .task {
            if started { return }
            started = true
            if let data = prefill { attach(data) }
        }
    }

    // MARK: screenshot

    private var readNote: String {
        switch read {
        case .reading: return "Reading the screenshot."
        case .filled: return "Filled in from the screenshot. Check the numbers."
        case .fallback: return "Auto-read is off. Enter the numbers yourself."
        case .none: return "Screenshot attached."
        }
    }

    private var screenshotCard: some View {
        HStack(spacing: 12) {
            Group {
                if let image = MBImage.ui(shot) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    MBRemoteImage(ref: keptRef)
                }
            }
            .frame(width: 56, height: 56)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            HStack(spacing: 8) {
                if read == .reading {
                    ProgressView().tint(theme.ink2)
                }
                Text(readNote)
                    .liType(.sub)
                    .foregroundColor(read == .filled ? theme.ink : theme.ink2)
            }
            Spacer(minLength: 0)
            Button(action: { detach() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(theme.ink3)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Remove screenshot")
        }
        .padding(10)
        .background(LITileSurface(radius: 16))
    }

    private func attach(_ data: Data) {
        shot = data
        keptRef = nil
        read = .reading
        readToken += 1
        let token = readToken
        Task {
            let result = await model.readScreenshot(data)
            if token != readToken { return }
            switch result {
            case .read(let r):
                if let a = r.amount { amount = a }
                if let name = r.app { app = name }
                if let h = r.hours { hours = h }
                read = .filled
                LIHaptics.tap()
            case .fallback:
                read = .fallback
            }
        }
    }

    private func detach() {
        readToken += 1
        shot = nil
        keptRef = nil
        read = .none
    }

    // MARK: hours and day

    private var hoursSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Hours worked").liType(.sub).foregroundColor(theme.ink2)
                Spacer()
                Text(rateLine).liType(.sub).foregroundColor(theme.ink3)
            }
            HStack(spacing: 10) {
                MBNumberField(unit: "h", maxValue: 24, value: $hours)
                    .frame(width: 120)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(0..<hourChips.count, id: \.self) { i in
                            let h = hourChips[i]
                            LIChip(Money.formatHours(h).replacingOccurrences(of: "h", with: ""), on: hours == h) {
                                hours = (hours == h) ? nil : h
                            }
                        }
                    }
                }
            }
        }
    }

    private var rateLine: String {
        if let a = amount, a > 0, let h = hours, h > 0 {
            return "\(Money.formatMoney(a / h)) an hour"
        }
        return "Optional"
    }

    private var daySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if showDate {
                MBDateField(label: "Day", date: $date, maxDate: today)
                if wasLocked {
                    Text("This day is locked. It can no longer be changed.").liType(.sub).foregroundColor(theme.warn)
                } else if locked {
                    Text("That day is locked. Days close at noon the next day.").liType(.sub).foregroundColor(theme.warn)
                } else if future {
                    Text("That day has not happened yet.").liType(.sub).foregroundColor(theme.warn)
                }
            }
            HStack {
                if !showDate {
                    Button(action: {
                        LIHaptics.tap()
                        showDate = true
                    }) {
                        HStack(spacing: 4) {
                            Text("Today, \(LIDate.formatDateShort(today)).").foregroundColor(theme.ink2)
                            Text("Change day").foregroundColor(theme.ink).underline()
                        }
                        .liType(.sub)
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(LIPressStyle())
                }
                Spacer()
                if shot == nil && read == .none && (keptRef ?? "").isEmpty && !wasLocked {
                    MBPhotoMenu(camera: $camera, library: $library) {
                        HStack(spacing: 6) {
                            Image(systemName: "camera")
                                .font(.system(size: 14, weight: .regular))
                            Text("Screenshot").liType(.sub)
                        }
                        .foregroundColor(theme.ink)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(theme.tile))
                        .overlay(Capsule().strokeBorder(theme.tileLine, lineWidth: 1))
                    }
                }
            }
        }
    }

    // MARK: footer and writes

    @ViewBuilder
    private var footer: some View {
        if confirmDelete {
            HStack(spacing: 10) {
                LISecondaryButton("Keep") { confirmDelete = false }
                MBDangerButton(title: "Delete entry", disabled: saving) { remove() }
            }
        } else {
            HStack(spacing: 10) {
                if editing != nil && !wasLocked {
                    MBDangerButton(title: "Delete", disabled: saving) { confirmDelete = true }
                }
                LIPrimaryButton(primaryTitle, busy: saving) { save() }
                    .disabled(!valid || read == .reading)
                    .opacity(valid && read != .reading ? 1 : 0.45)
            }
        }
    }

    private var primaryTitle: String {
        if editing != nil { return "Save" }
        if let a = amount, a > 0 { return "Add \(Money.formatMoney(a))" }
        return "Add"
    }

    private func save() {
        guard valid, let value = amount else { return }
        saving = true
        errorText = nil
        let day = date
        let appName = app
        let hoursValue: Double? = (hours ?? 0) > 0 ? hours : nil
        let data = shot
        let kept = keptRef
        Task {
            var ref = kept
            var note: String? = nil
            if let data = data {
                do {
                    ref = try await model.storeScreenshot(data)
                } catch {
                    // A photo that will not store should not block the money from being logged.
                    ref = nil
                    note = "Saved without the screenshot"
                }
            }
            let input = MoneyEarningInput(date: day, amount: value, app: appName, hours: hoursValue, screenshotUrl: ref)
            do {
                if let prev = editing {
                    try await model.save(prev, input)
                } else {
                    try await model.add(input)
                }
                LIHaptics.celebrate()
                onClose(note ?? (editing != nil ? "Saved" : "\(Money.formatMoney(value)) added"))
            } catch {
                LIHaptics.error()
                errorText = "Could not save. Try again."
                saving = false
            }
        }
    }

    private func remove() {
        guard let prev = editing else { return }
        saving = true
        Task {
            do {
                try await model.delete(prev)
                onClose("Entry deleted")
            } catch {
                LIHaptics.error()
                errorText = "Could not delete. Try again."
                confirmDelete = false
                saving = false
            }
        }
    }
}

/// A new money target and deadline. Starts a fresh running total from today and leaves the floor alone.
struct MoneyTargetSheet: View {
    @Environment(\.liTheme) private var theme

    let model: MoneyModel
    let challenge: Challenge
    let floor: Double
    let earnedToday: Double
    let allTime: Double
    let today: DateStr
    let onClose: (String?) -> Void

    @State private var target: Double?
    @State private var deadline: DateStr
    @State private var saving = false
    @State private var errorText: String? = nil

    init(model: MoneyModel, challenge: Challenge, floor: Double, earnedToday: Double, allTime: Double, today: DateStr, onClose: @escaping (String?) -> Void) {
        self.model = model
        self.challenge = challenge
        self.floor = floor
        self.earnedToday = earnedToday
        self.allTime = allTime
        self.today = today
        self.onClose = onClose
        let end = Challenges.plannedEnd(challenge)
        let startTarget: Double = (challenge.moneyTarget ?? 0) > 0 ? (challenge.moneyTarget ?? 1000) : 1000
        _target = State(initialValue: startTarget)
        _deadline = State(initialValue: end > today ? end : LIDate.addDays(today, 7))
    }

    private var valid: Bool {
        return Money.validNewTarget(target, deadline: deadline, total: earnedToday, today: today)
    }

    private var guidance: String {
        if let t = target, t <= earnedToday {
            return "Pick a number above \(Money.formatMoney(earnedToday))."
        }
        if valid, let t = target {
            let need = Money.neededPerDay(target: t, total: earnedToday, today: today, deadline: deadline, floor: floor)
            if let perDay = need.perDay {
                return "\(Money.formatMoney(need.remaining)) to go by \(LIDate.formatDateShort(deadline)). That is \(Money.formatMoney(perDay.rounded(.up))) a day over \(need.days) \(need.days == 1 ? "day" : "days"). The daily floor stays \(Money.formatMoney(floor))."
            }
        }
        return "Pick a deadline that is today or later."
    }

    var body: some View {
        MBSheet(title: "New target", subtitle: "Starts a fresh total from today. The \(Money.formatMoney(allTime)) earned so far stays as your all time total.") {
            MBNumberField(prefix: "$", decimal: false, hero: true, maxValue: 9_999_999, autofocus: true, value: $target)
            MBDateField(label: "Deadline", date: $deadline, minDate: today)
            Text(errorText ?? guidance)
                .liType(.sub)
                .foregroundColor(errorText == nil ? theme.ink2 : theme.warn)
                .frame(minHeight: 40, alignment: .topLeading)
        } footer: {
            LIPrimaryButton("Set target", busy: saving) { save() }
                .disabled(!valid)
                .opacity(valid ? 1 : 0.45)
        }
    }

    private func save() {
        guard valid, let t = target else { return }
        saving = true
        errorText = nil
        let due = deadline
        Task {
            do {
                try await model.resetTarget(t, deadline: due, from: today)
                LIHaptics.celebrate()
                onClose("New target set")
            } catch {
                LIHaptics.error()
                errorText = "Could not save. Try again."
                saving = false
            }
        }
    }
}
