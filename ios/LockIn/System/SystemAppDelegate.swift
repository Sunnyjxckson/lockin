import UIKit
import UserNotifications
import LockInKit

/// Notification delegate and the APNs token. The token is kept in the app group until the server can take it.
final class SystemAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushToken.store(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // No token yet (simulator, or push not set up). Local reminders do not need one.
    }

    /// Show reminders as a banner even while the app is open.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    /// A tap on a reminder, a quote drop or a focus alert. Each carries the app path it opens in `userInfo["url"]`.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if response.actionIdentifier == UNNotificationDefaultActionIdentifier, let url = info["url"] as? String, !url.isEmpty {
            Task { @MainActor in AppRouter.shared.open(url) }
        }
        completionHandler()
    }
}
