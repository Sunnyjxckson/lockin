import Foundation

public typealias DateStr = String
public typealias TimeStr = String

/// The New York wall clock for an instant.
public struct NYParts: Equatable {
    public var date: DateStr
    public var time: TimeStr
    public var hour: Int
    public var minute: Int
    /// Minutes since midnight.
    public var minutes: Int
    /// 0 is Sunday, 6 is Saturday.
    public var weekday: Int
}

/// Calendar dates and clock times. Every calendar date is an America/New_York "YYYY-MM-DD" string.
/// Port of src/lib/logic/dates.ts. Day arithmetic runs on a plain day count so no time zone can shift it.
public enum LIDate {
    public static let timeZoneId = "America/New_York"

    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York") ?? TimeZone.current
        return c
    }()

    static func pad(_ n: Int) -> String {
        return n < 10 ? "0\(n)" : String(n)
    }

    // MARK: day counts

    /// Days since 1970-01-01 for a civil date.
    static func daysFromCivil(_ year: Int, _ month: Int, _ day: Int) -> Int {
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let mp = month > 2 ? month - 3 : month + 9
        let doy = (153 * mp + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    static func civilFromDays(_ days: Int) -> (Int, Int, Int) {
        let z = days + 719468
        let era = (z >= 0 ? z : z - 146096) / 146097
        let doe = z - era * 146097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        let y = yoe + era * 400
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp < 10 ? mp + 3 : mp - 9
        return (m <= 2 ? y + 1 : y, m, d)
    }

    /// Splits "YYYY-MM-DD". Bad input reads as 1970-01-01.
    static func ymd(_ date: DateStr) -> (Int, Int, Int) {
        let parts = date.split(separator: "-")
        if parts.count < 3 { return (1970, 1, 1) }
        return (Int(parts[0]) ?? 1970, Int(parts[1]) ?? 1, Int(parts[2]) ?? 1)
    }

    static func toDayCount(_ date: DateStr) -> Int {
        let (y, m, d) = ymd(date)
        return daysFromCivil(y, m, d)
    }

    static func fromDayCount(_ n: Int) -> DateStr {
        let (y, m, d) = civilFromDays(n)
        let year = y < 10 ? "000\(y)" : y < 100 ? "00\(y)" : y < 1000 ? "0\(y)" : String(y)
        return "\(year)-\(pad(m))-\(pad(d))"
    }

    public static func isDateStr(_ s: String) -> Bool {
        let parts = s.split(separator: "-", omittingEmptySubsequences: false)
        if parts.count != 3 || parts[0].count != 4 || parts[1].count != 2 || parts[2].count != 2 { return false }
        guard let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]) else { return false }
        if m < 1 || m > 12 || d < 1 { return false }
        let (ry, rm, rd) = civilFromDays(daysFromCivil(y, m, d))
        return ry == y && rm == m && rd == d
    }

    public static func addDays(_ date: DateStr, _ n: Int) -> DateStr {
        return fromDayCount(toDayCount(date) + n)
    }

    /// Whole days from a to b. Positive when b is later.
    public static func diffDays(_ a: DateStr, _ b: DateStr) -> Int {
        return toDayCount(b) - toDayCount(a)
    }

    /// 0 is Sunday, 6 is Saturday.
    public static func weekdayOf(_ date: DateStr) -> Int {
        // Day count 0 (1970-01-01) was a Thursday.
        return (((toDayCount(date) + 4) % 7) + 7) % 7
    }

    /// Inclusive list of dates from a to b. Empty when b is before a.
    public static func dateRange(_ a: DateStr, _ b: DateStr) -> [DateStr] {
        let start = toDayCount(a)
        let end = toDayCount(b)
        if end < start { return [] }
        var out: [DateStr] = []
        out.reserveCapacity(end - start + 1)
        var n = start
        while n <= end {
            out.append(fromDayCount(n))
            n += 1
        }
        return out
    }

    // MARK: now in New York

    public static func nyParts(_ at: Date = Date()) -> NYParts {
        let comps = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: at)
        let y = comps.year ?? 1970
        let m = comps.month ?? 1
        let d = comps.day ?? 1
        let hour = (comps.hour ?? 0) % 24
        let minute = comps.minute ?? 0
        let date = fromDayCount(daysFromCivil(y, m, d))
        return NYParts(date: date, time: "\(pad(hour)):\(pad(minute))", hour: hour, minute: minute, minutes: hour * 60 + minute, weekday: weekdayOf(date))
    }

    /// Same, for an ISO timestamp string. Unreadable input reads as the epoch.
    public static func nyParts(iso: String) -> NYParts {
        return nyParts(parseISO(iso) ?? Date(timeIntervalSince1970: 0))
    }

    public static func todayNY(_ now: Date = Date()) -> DateStr {
        return nyParts(now).date
    }

    public static func timeNY(_ now: Date = Date()) -> TimeStr {
        return nyParts(now).time
    }

    // MARK: ISO instants

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Reads "2026-10-05T10:00:59.123456+00:00", "...Z" and the plain forms.
    public static func parseISO(_ s: String) -> Date? {
        if let d = isoFractional.date(from: s) { return d }
        if let d = isoPlain.date(from: s) { return d }
        // Microseconds or a space separator: drop the fraction and try again.
        var t = s
        if let dot = t.firstIndex(of: ".") {
            var end = t.index(after: dot)
            while end < t.endIndex, t[end].isNumber { end = t.index(after: end) }
            t.removeSubrange(dot..<end)
        }
        t = t.replacingOccurrences(of: " ", with: "T")
        return isoPlain.date(from: t)
    }

    /// Timestamp for created_at and completed_at. An instant, not a calendar date.
    public static func nowIso(_ now: Date = Date()) -> String {
        return isoFractional.string(from: now)
    }

    // MARK: day arithmetic helpers

    /// Day 1 is startDate. Before the start this is 0 or negative.
    public static func dayNumber(_ startDate: DateStr, _ date: DateStr) -> Int {
        return diffDays(startDate, date) + 1
    }

    public static func dateOfDay(_ startDate: DateStr, _ day: Int) -> DateStr {
        return addDays(startDate, day - 1)
    }

    public static func challengeEndDate(_ startDate: DateStr, _ lengthDays: Int) -> DateStr {
        return addDays(startDate, lengthDays - 1)
    }

    public static func isInChallenge(_ startDate: DateStr, _ lengthDays: Int, _ date: DateStr) -> Bool {
        let n = dayNumber(startDate, date)
        return n >= 1 && n <= lengthDays
    }

    public static func challengeDates(_ startDate: DateStr, _ lengthDays: Int) -> [DateStr] {
        return dateRange(startDate, challengeEndDate(startDate, lengthDays))
    }

    // MARK: weeks (Monday to Sunday)

    public static func weekStart(_ date: DateStr) -> DateStr {
        let wd = weekdayOf(date)
        return addDays(date, wd == 0 ? -6 : 1 - wd)
    }

    public static func weekEnd(_ date: DateStr) -> DateStr {
        return addDays(weekStart(date), 6)
    }

    public static func weekDates(_ date: DateStr) -> [DateStr] {
        let s = weekStart(date)
        return dateRange(s, addDays(s, 6))
    }

    // MARK: months

    public static func monthStart(_ date: DateStr) -> DateStr {
        return String(date.prefix(7)) + "-01"
    }

    public static func monthEnd(_ date: DateStr) -> DateStr {
        let (y, m, _) = ymd(date)
        let next = m == 12 ? "\(y + 1)-01-01" : "\(y)-\(pad(m + 1))-01"
        return addDays(next, -1)
    }

    public static func addMonths(_ date: DateStr, _ n: Int) -> DateStr {
        let (y, m, _) = ymd(date)
        let total = y * 12 + (m - 1) + n
        let year = Int((Double(total) / 12.0).rounded(.down))
        let month = total - year * 12
        return "\(year)-\(pad(month + 1))-01"
    }

    // MARK: clock times

    public static func isTimeStr(_ s: String) -> Bool {
        let parts = s.split(separator: ":", omittingEmptySubsequences: false)
        if parts.count != 2 || parts[0].count != 2 || parts[1].count != 2 { return false }
        guard let h = Int(parts[0]), let m = Int(parts[1]) else { return false }
        return h >= 0 && h <= 23 && m >= 0 && m <= 59
    }

    public static func minutesOf(_ time: TimeStr) -> Int {
        let parts = time.split(separator: ":")
        if parts.count < 2 { return 0 }
        return (Int(parts[0]) ?? 0) * 60 + (Int(parts[1]) ?? 0)
    }

    public static func timeFromMinutes(_ minutes: Int) -> TimeStr {
        let m = ((minutes % 1440) + 1440) % 1440
        return "\(pad(m / 60)):\(pad(m % 60))"
    }

    public static func addMinutes(_ time: TimeStr, _ delta: Int) -> TimeStr {
        return timeFromMinutes(minutesOf(time) + delta)
    }

    /// Minutes from start to end. An end at or before the start is the next day.
    public static func durationMinutes(_ start: TimeStr, _ end: TimeStr) -> Int {
        let d = minutesOf(end) - minutesOf(start)
        return d > 0 ? d : d + 1440
    }

    /// "06:30" to "6:30 AM".
    public static func formatTime(_ time: TimeStr) -> String {
        let parts = time.split(separator: ":")
        let h = parts.count > 0 ? (Int(parts[0]) ?? 0) : 0
        let m = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0
        let h12 = h % 12 == 0 ? 12 : h % 12
        return "\(h12):\(pad(m)) \(h < 12 ? "AM" : "PM")"
    }

    /// 90 to "1h 30m", 45 to "45m", 120 to "2h".
    public static func formatDuration(_ minutes: Int) -> String {
        let m = max(0, minutes)
        let h = m / 60
        let r = m % 60
        if h == 0 { return "\(r)m" }
        return r == 0 ? "\(h)h" : "\(h)h \(r)m"
    }

    // MARK: display

    static let monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    static let monthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    static let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    /// "Monday, Oct 5"
    public static func formatDateLong(_ date: DateStr) -> String {
        let (_, m, d) = ymd(date)
        return "\(dayNames[weekdayOf(date)]), \(monthsShort[m - 1]) \(d)"
    }

    /// "Oct 5"
    public static func formatDateShort(_ date: DateStr) -> String {
        let (_, m, d) = ymd(date)
        return "\(monthsShort[m - 1]) \(d)"
    }

    /// "Thursday, October 8"
    public static func formatDateFull(_ date: DateStr) -> String {
        let (_, m, d) = ymd(date)
        return "\(dayNames[weekdayOf(date)]), \(monthsLong[m - 1]) \(d)"
    }

    /// "October 2026"
    public static func formatMonth(_ date: DateStr) -> String {
        let (y, m, _) = ymd(date)
        return "\(monthsLong[m - 1]) \(y)"
    }

    // MARK: instants

    /// The instant a New York wall clock time happens on a calendar date.
    public static func nyInstant(_ date: DateStr, _ time: TimeStr) -> Date {
        let (y, mo, d) = ymd(date)
        let mins = minutesOf(time)
        let wall = Double(daysFromCivil(y, mo, d)) * 86_400_000.0 + Double(mins) * 60_000.0
        var guess = wall
        for _ in 0..<2 {
            let p = nyParts(Date(timeIntervalSince1970: guess / 1000.0))
            let (py, pm, pd) = ymd(p.date)
            let seen = Double(daysFromCivil(py, pm, pd)) * 86_400_000.0 + Double(p.minutes) * 60_000.0
            guess += wall - seen
        }
        return Date(timeIntervalSince1970: guess / 1000.0)
    }

    // MARK: edit lock

    /// The instant a day locks: noon New York time on the day after `date`.
    /// Days before the app was first opened (`installedOn`) stay open as long as the install day does.
    public static func lockInstant(_ date: DateStr, installedOn: DateStr? = nil) -> Date {
        var anchor = date
        if let installed = installedOn, date < installed { anchor = installed }
        return nyInstant(addDays(anchor, 1), "12:00")
    }

    /// A day can be edited until noon the next day, then it locks.
    public static func isDayLocked(_ date: DateStr, now: Date = Date(), installedOn: DateStr? = nil) -> Bool {
        return now.timeIntervalSince1970 >= lockInstant(date, installedOn: installedOn).timeIntervalSince1970
    }

    /// Editable means not in the future and not locked.
    public static func isDayEditable(_ date: DateStr, now: Date = Date(), installedOn: DateStr? = nil) -> Bool {
        return date <= todayNY(now) && !isDayLocked(date, now: now, installedOn: installedOn)
    }

    /// True when `time` is inside quiet hours. The window may wrap past midnight. Start is quiet, end is not.
    public static func isQuiet(_ time: TimeStr, quietStart: TimeStr, quietEnd: TimeStr) -> Bool {
        let t = minutesOf(time)
        let s = minutesOf(quietStart)
        let e = minutesOf(quietEnd)
        if s == e { return false }
        return s < e ? (t >= s && t < e) : (t >= s || t < e)
    }
}
