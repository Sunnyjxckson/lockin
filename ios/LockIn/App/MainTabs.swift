import SwiftUI
import LockInKit

enum AppTab: Hashable {
    case today, plan, money, body, record, library
}

/// The root tab bar. Each tab carries the top bar with the Coach button and the More sheet.
struct MainTabs: View {
    @Environment(AppStore.self) private var store
    @Environment(SessionStore.self) private var session
    @Environment(\.liTheme) private var theme
    @State private var tab: AppTab = .today
    @State private var showMore = false
    @State private var showCoach = false

    var body: some View {
        TabView(selection: $tab) {
            shell { TodayView() }
                .tabItem { Label("Today", systemImage: "checkmark.circle") }
                .tag(AppTab.today)
            shell { PlanView() }
                .tabItem { Label("Plan", systemImage: "calendar") }
                .tag(AppTab.plan)
            shell { MoneyView() }
                .tabItem { Label("Money", systemImage: "dollarsign.circle") }
                .tag(AppTab.money)
            shell { BodyView() }
                .tabItem { Label("Body", systemImage: "figure.strengthtraining.traditional") }
                .tag(AppTab.body)
            shell { RecordView() }
                .tabItem { Label("Record", systemImage: "chart.bar") }
                .tag(AppTab.record)
            shell { LibraryView() }
                .tabItem { Label("Library", systemImage: "book") }
                .tag(AppTab.library)
        }
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(theme.surface, for: .tabBar)
        .toolbarColorScheme(theme.colorScheme, for: .tabBar)
        .sheet(isPresented: $showMore) {
            MoreSheet().liSheetStyle()
        }
        .sheet(isPresented: $showCoach) {
            NavigationStack { CoachView() }.liSheetStyle()
        }
        .onChange(of: store.needsLogin) { _, needs in
            if needs { session.sessionExpired() }
        }
    }

    private func shell<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        let built = content()
        return NavigationStack {
            built
                .toolbar(.hidden, for: .navigationBar)
                .safeAreaInset(edge: .top, spacing: 0) {
                    TopBar(initial: initial, onCoach: { showCoach = true }, onMore: { showMore = true })
                }
        }
    }

    private var initial: String {
        let name = (store.settings?.displayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "L" }
        return String(name.prefix(1)).uppercased()
    }
}

/// "Lock In" small on the left, the Coach button and the round gradient mark that opens More on the right.
struct TopBar: View {
    @Environment(\.liTheme) private var theme
    let initial: String
    let onCoach: () -> Void
    let onMore: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text("Lock In").liType(.label).foregroundColor(theme.ink2)
            Spacer()
            Button(action: {
                LIHaptics.tap()
                onCoach()
            }) {
                Image(systemName: "bubble.left")
                    .font(.system(size: 19, weight: .regular))
                    .foregroundColor(theme.ink2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("Coach")
            Button(action: {
                LIHaptics.tap()
                onMore()
            }) {
                Text(initial)
                    .liType(.caption)
                    .foregroundColor(theme.accentInk)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(theme.gradient))
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(LIPressStyle())
            .accessibilityLabel("More")
        }
        .padding(.horizontal, 20)
        .frame(height: 48)
        .background(Color.clear)
    }
}

/// Focus, Meals, Boards, Vices and Settings. All but Settings are placeholders until their screens land.
struct MoreSheet: View {
    @Environment(\.liTheme) private var theme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                LIBackground()
                ScrollView {
                    VStack(spacing: 0) {
                        row("Focus", "timer") { FocusView() }
                        LIHairline()
                        row("Meals", "fork.knife") { MealsView() }
                        LIHairline()
                        row("Boards", "square.grid.2x2") { BoardsView() }
                        LIHairline()
                        row("Vices", "shield") { VicesView() }
                        LIHairline()
                        row("Settings", "gearshape") { SettingsView() }
                    }
                    .background(LITileSurface(radius: 24))
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                }
            }
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func row<Destination: View>(_ title: String, _ icon: String, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink(destination: destination()) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .regular))
                    .foregroundColor(theme.ink2)
                    .frame(width: 24)
                Text(title).liType(.body).foregroundColor(theme.ink)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(theme.ink3)
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(LIPressStyle())
    }
}
