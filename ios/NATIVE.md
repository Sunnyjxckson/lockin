# Lock In for iOS

The native app. SwiftUI, iOS 17+, in this folder. The web app in `src/` stays live and both read and write the same Supabase data through the same Vercel API, so a check off on the phone shows on the web and the other way round.

Read `docs/PRD.md` (the spec) and `docs/BUILD.md` (data model, rules, design system) first. The web code in `src/` is the reference implementation: when a rule is unclear, port what `src/lib/logic/*` does and copy its tests.

Never use an em dash or en dash character in anything written here: code, comments, UI copy, commit messages.

## Layout

```
ios/
  project.yml            XcodeGen spec. The .xcodeproj is generated, never committed
  NATIVE.md              this file
  LockInKit/             shared Swift framework, used by every target
    API/                 APIClient, auth, DB client mirroring /api/db
    Models/              Codable row types, one per table, snake_case keys
    Logic/               pure ports of src/lib/logic (dates, day, streaks, targets, challenge, floor, focus...)
    Store/               AppStore: observable cache over the API, writes the widget snapshot
    Design/              tokens, fonts, components
    Shared/              app group, WidgetSnapshot, Live Activity attributes, notification ids
    Resources/           fonts
  LockIn/                the app target
    App/                 LockInApp, root, tab bar, login
    Features/<Feature>/  one folder per screen area (Today, Plan, Money, Body, Record, Library, Coach, Vices, Focus, Meals, Boards, Settings)
    Resources/           Assets, Info.plist, entitlements
  LockInWidgets/         widget extension: home and lock screen widgets, Live Activity, interactive check off (AppIntents)
  LockInFocusMonitor/    DeviceActivityMonitor extension: lifts the app shield when a focus block ends even if the app is closed
  LockInShield/          ShieldConfiguration extension: the Lock In look on a blocked app
  LockInKitTests/        XCTest for Logic and Models
```

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

On the Mac: `brew install xcodegen`, then `cd ios && xcodegen`, open `LockIn.xcodeproj`, pick the team, plug in the phone, Run. TestFlight: Product, Archive, Distribute.
