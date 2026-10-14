import ManagedSettings
import ManagedSettingsUI
import UIKit
import LockInKit

/// What a blocked app shows: the Lock In look and when it opens again.
final class ShieldConfig: ShieldConfigurationDataSource {
    private let bg = UIColor(red: 0.051, green: 0.043, blue: 0.063, alpha: 1)
    private let ink = UIColor(red: 0.957, green: 0.937, blue: 0.910, alpha: 1)
    private let ink2 = UIColor(red: 0.725, green: 0.694, blue: 0.753, alpha: 1)
    private let accent = UIColor(red: 0.890, green: 0.780, blue: 0.604, alpha: 1)
    private let accentInk = UIColor(red: 0.051, green: 0.043, blue: 0.063, alpha: 1)

    /// "Back at 4:30 PM" while a lock is running, otherwise a plain line.
    private func line() -> String {
        guard let end = FocusLock.endsAt, end > Date() else { return "Back to it." }
        let time = LIDate.formatTime(LIDate.timeNY(end))
        return "Back at \(time)"
    }

    private func config() -> ShieldConfiguration {
        let icon = UIImage(systemName: "lock.fill")?.withTintColor(accent, renderingMode: .alwaysOriginal)
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: bg.withAlphaComponent(0.92),
            icon: icon,
            title: ShieldConfiguration.Label(text: "Locked in", color: ink),
            subtitle: ShieldConfiguration.Label(text: line(), color: ink2),
            primaryButtonLabel: ShieldConfiguration.Label(text: "OK", color: accentInk),
            primaryButtonBackgroundColor: accent,
            secondaryButtonLabel: nil
        )
    }

    override func configuration(shielding application: Application) -> ShieldConfiguration { config() }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { config() }
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { config() }
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { config() }
}
