# Lock In for iOS

The native app. SwiftUI, iOS 17+, in this folder. The web app in `src/` stays live and both read and write the same Supabase data through the same Vercel API, so a check off on the phone shows on the web and the other way round.

Read `docs/PRD.md` (the spec) and `docs/BUILD.md` (data model, rules, design system) first. The web code in `src/` is the reference implementation: when a rule is unclear, port what `src/lib/logic/*` does and copy its tests.

Never use an em dash or en dash character in anything written here: code, comments, UI copy, commit messages.

## Layout

```
ios/
  project.yml            XcodeGen spec. The .xcodeproj is generated, never committed
  NATIVE.md              this file
  Config/                entitlements, written by XcodeGen from project.yml
  LockInKit/             shared Swift framework, used by every target
    API/                 APIClient, auth, DBClient mirroring /api/db
    Models/              Codable row types, one per table, snake_case keys
    Logic/               pure ports of src/lib/logic (dates, day, streaks, targets, challenges, money, plan, body, vices, library, drops, coach, coach flags, meals, boards, theme)
    Store/               AppStore (observable cache, widget snapshot) and one AppStore+<Feature> extension per feature for its loads and writes
    System/              NotificationScheduler, Live Activity manager, FocusLock, push token, system prefs
    Design/              tokens, theme builder, fonts, components
    Shared/              app group, WidgetSnapshot, Live Activity attributes, focus shield store
    Resources/           fonts, bundled quotes
  LockIn/                the app target
    App/                 LockInApp, RootView, MainTabs (tab root), AppRouter (notification taps), login, session
    System/              SystemAppDelegate (the one app delegate), SystemCoordinator (notifications, Live Activity, focus lock follow the store)
    Features/<Feature>/  one folder per screen area
    Resources/           Assets, Info.plist
  LockInWidgets/         widget extension: home and lock screen widgets, Live Activity, interactive check off (AppIntents)
  LockInFocusMonitor/    DeviceActivityMonitor extension: lifts the app shield when a focus block ends even if the app is closed
  LockInShield/          ShieldConfiguration extension: the Lock In look on a blocked app
  LockInKitTests/        XCTest for Logic, Models and the notification budget
```

## What each feature does

All of it reads and writes the same Supabase tables as the web app, through DBClient.

- Today: the day's checklist with tap to check, numbers and text, the percent ring, workout, day complete moment.
- Plan: the day timeline with now and next, edit blocks for one day or the weekly template, month calendar.
- Money: earnings by app, the daily floor, challenge target and pace, add and edit earnings. The groceries tile opens Meals. With no challenge it links to the challenge page in Settings.
- Body: weight and weigh-ins, meals and macros (with the photo estimate route), workout log with sets.
- Record: history, streaks, per item and per week progress, share image.
- Library: finish a library of real quotes like a book, reader with notes and saves, writers, themes, moments, search, saved. Philosophy drops are local notifications of the short quotes.
- Coach: chat in three voices, check-ins the app sends itself, morning and Sunday notes, flags. The chat sends the Library lines for what you wrote and the pattern flags to /api/coach/chat, the same as the web.
- Vices: clean streaks, log a slip with time and trigger, detail per vice.
- Focus: timer and study blocks, Live Activity, Focus lock (apps shielded while a session runs).
- Meals: week planner under a budget, planned meal sheet, recipes, grocery list.
- Boards: boards of pieces, collage, and the look studio that sets the app palette.
- Settings: checklist, weekly plan, workouts, challenge, reminders, coach, quiet hours, drops, name, haptics, base look.

## Notifications

- One place asks for permission: `NotificationScheduler.requestAuthorization()`. The coordinator calls it on first foreground when reminders are on, and turning drops on goes through `AppStore.setDrops`, which calls the same function.
- One app delegate: `SystemAppDelegate`, installed with `UIApplicationDelegateAdaptor`. It shows banners in the foreground and sends taps to `AppRouter`.
- Budget (iOS keeps 64 pending and drops the rest): reminders go first, two days of them, at most 44. Quote drops fill what is left, looking at most 7 days ahead, after a margin of 4 and a reserve of 2 for the focus alerts (`NotificationScheduler.dropBudget`). The soonest drops are kept.
- After Settings saves reminders, quiet hours, drops or the weekly template, `.lockInNotificationsChanged` is posted. `SystemCoordinator` reloads the reminders, replans them, then replans the drops.
- A tap carries `userInfo["url"]`. `AppRouter` maps it: `/library/read?...q=<id>` opens the Library reader on that quote, `/money`, `/body/workout`, `/today`, `/plan`, `/record` select the tab, `/focus` opens Focus.

## Theme

The active theme row (base plus board palette) is applied by `AppStore.applyThemeRow` the moment Boards or Settings saves it, then the store reloads. `RootView` injects `store.theme` into the environment, so every screen and sheet follows without a restart. The theme is also written into `WidgetSnapshot` (`themeBase`, `themePalette`) and the widgets build their colors from it (`W.apply`).

## Identifiers

- Bundle prefix `com.sunnyjackson.lockin` (app), `.widgets`, `.focusmonitor`, `.shield`
- App group `group.com.sunnyjackson.lockin`
- `DEVELOPMENT_TEAM` is left empty in project.yml. Set it once in Xcode (Signing and Capabilities) or with `DEVELOPMENT_TEAM=XXXX xcodegen`
- Deployment target iOS 17.0, Swift 6 language mode off (Swift 5 mode, strict concurrency minimal) to keep the build simple

## Backend

- Base URL is stored in the app (set on the login screen, kept in the app group defaults). Default is the production Vercel URL
- Auth: `POST /api/auth/login` with the passcode sets a cookie. The cookie jar lives in the app group so the widget extension can call the API too
- Data: `POST /api/db` with `{ op, table, args }`, exactly what `src/lib/db/remote.ts` sends. `DBClient` in LockInKit mirrors `list, first, get, insert, insertMany, update, upsert, remove, removeWhere` and the `Query` shape
- AI: call the existing routes (`/api/coach/chat`, `/api/body/meal-estimate`, `/api/money/read`, `/api/meals/request`). Never call Anthropic from the phone
- Photos: `/api/storage`

## Rules

- All calendar dates are America/New_York `YYYY-MM-DD` strings. Use `LIDate` helpers in LockInKit, never `Date()` formatting with the device zone
- Every PRD rule in BUILD.md "Rules from the PRD that live in pure functions" lives in `LockInKit/Logic` with XCTest cases ported from the matching `*.test.ts`
- Any write that changes what a widget shows calls `AppStore.refreshWidgets()`, which writes `WidgetSnapshot` to the app group and reloads timelines

## Design

Port the web design system (BUILD.md "Design system", tokens in `src/lib/theme` and `src/app/globals.css`): Aubergine dark base, one accent for done, big numbers, few words, Schibsted Grotesk. It should feel like day to day use with a luxury edge, not a fitness app. Use native SwiftUI motion and `UIImpactFeedbackGenerator` / `.sensoryFeedback` for haptics. Every screen has a real empty state. No emoji in the UI.

## Native features

- Widgets: small (day and percent ring), medium (now and next block plus percent), large (checklist with tap to check via AppIntent), lock screen circular (percent), rectangular (next block), inline (day X of 30)
- Live Activity: the current schedule block or the running focus timer, on the lock screen and Dynamic Island
- Notifications: local notifications scheduled from the `reminder` table and the day's blocks, plus the 8 pm earnings nudge. Remote push through APNs is a server addition (`/api/push/apns`) on top
- Focus lock: FamilyControls (individual authorization), ManagedSettings shield on the apps the user picks, applied while a focus session or study block runs. The monitor extension lifts it at the planned end

## Build check

`.github/workflows/ios.yml` runs on every push that touches `ios/`: installs XcodeGen, generates the project, builds for the simulator with signing off, and runs LockInKitTests. A change is not done until that is green.

## Running it on the phone

On the Mac: `brew install xcodegen`, then `cd ios && xcodegen`, open `LockIn.xcodeproj`.

1. Select the LockIn project, then each of the four targets (LockIn, LockInWidgets, LockInFocusMonitor, LockInShield), Signing and Capabilities, and pick the team. Or run `DEVELOPMENT_TEAM=XXXXXXXXXX xcodegen` once so the team is baked in.
2. Register the app group `group.com.sunnyjackson.lockin` and the four bundle ids (`com.sunnyjackson.lockin`, `.widgets`, `.focusmonitor`, `.shield`) in the Apple developer portal. Automatic signing does this the first time you build for a device.
3. Plug in the phone, pick it, Run. On first launch set the server URL on the login screen and enter the passcode.

## TestFlight

1. Create the app record in App Store Connect with bundle id `com.sunnyjackson.lockin`.
2. Bump `CURRENT_PROJECT_VERSION` in project.yml for every upload (and `MARKETING_VERSION` for a new release), run `xcodegen`.
3. Product, Archive with the LockIn scheme on "Any iOS Device", then Distribute App, App Store Connect, Upload.
4. In App Store Connect add the build to an internal testing group. Internal testers need no review.
5. `aps-environment` is `development` in project.yml; the distribution profile Xcode creates switches it to production. Remote push still needs the server route `/api/push/apns`; local reminders do not.

### Family Controls distribution entitlement

`com.apple.developer.family-controls` works on a development profile, but a build uploaded to TestFlight or the App Store needs Apple to approve the distribution entitlement. It must be requested at https://developer.apple.com/contact/request/family-controls-distribution once for each of the four bundle ids that carry it: `com.sunnyjackson.lockin` (app), `com.sunnyjackson.lockin.widgets`, `com.sunnyjackson.lockin.focusmonitor` and `com.sunnyjackson.lockin.shield`. Until Apple approves them, archive and upload fail on provisioning for those ids. In the meantime run from Xcode on your own device, where Focus lock works with the development entitlement. Only the app, `.focusmonitor` and `.shield` declare the entitlement in project.yml today; request `.widgets` only if a widget ever needs to read the selection.

## Build check

`.github/workflows/ios.yml` runs on every push that touches `ios/`: installs XcodeGen, generates the project, builds for the simulator with signing off, and runs LockInKitTests. A change is not done until that is green.

## Foundation decisions (ios-native)

- Swift 5 language mode, iOS 17, @Observable. `ios/project.yml` is the only source of the Xcode project (XcodeGen); the .xcodeproj is not committed.
- Everything shared lives in the LockInKit framework. Fonts: Schibsted Grotesk Regular and Medium static TTFs in LockInKit/Resources, registered at launch by `LIFont`.
- Writes go through AppStore helpers (`setChecked`, `setValue`, `setText`) and the per feature extensions, which are optimistic where it matters, serialized and rolled back on failure. `AppStore.reload()` never drops a request: one asked for during a reload runs again right after.
- Any write that changes what a widget shows calls `AppStore.refreshWidgets()`.
- Not done: remote push (`/api/push/apns` on the server), and the Family Controls distribution approval above.
