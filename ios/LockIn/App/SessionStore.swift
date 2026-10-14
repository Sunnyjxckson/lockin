import Foundation
import Observation
import LockInKit

/// Who is signed in, which server, and the store for the signed in session.
@Observable
final class SessionStore {
    enum Phase: Equatable {
        case checking
        /// Shows the login screen. The text is a note above the keypad (expired session, offline).
        case signedOut(String?)
        /// The server answered but cannot be used: no passcode set, Supabase off.
        case problem(String)
        case signedIn
    }

    var phase: Phase = .checking
    var serverText: String = AppGroup.baseURLString
    private(set) var store: AppStore? = nil
    @ObservationIgnored private var api: APIClient? = nil

    /// Check the saved server and cookie on launch.
    @MainActor
    func bootstrap() async {
        if case .signedIn = phase { return }
        do {
            let client = try APIClient.make(from: serverText)
            let status = try await client.authStatus()
            try await enter(client: client, status: status)
        } catch let error as APIError {
            if error == .invalidURL {
                phase = .signedOut(error.errorDescription)
            } else if error.isOffline {
                phase = .signedOut("Could not reach the server. Check the address.")
            } else {
                phase = .signedOut(error.errorDescription)
            }
        } catch {
            phase = .signedOut("Could not reach the server.")
        }
    }

    @MainActor
    private func enter(client: APIClient, status: AuthStatus) async throws {
        api = client
        AppGroup.baseURLString = client.baseURL.absoluteString
        serverText = client.baseURL.absoluteString
        if let problem = status.problem {
            phase = .problem(problem)
            return
        }
        if status.mode != "server" {
            phase = .problem("The server has no passcode set. Set LOCKIN_PASSCODE on Vercel, then try again.")
            return
        }
        if status.authed {
            startStore(client: client)
        } else {
            phase = .signedOut(nil)
        }
    }

    @MainActor
    private func startStore(client: APIClient) {
        let s = AppStore(db: DBClient(api: client))
        store = s
        phase = .signedIn
        Task { await s.reload() }
    }

    /// Returns an error line to show, or nil when signed in.
    @MainActor
    func login(passcode: String, serverText text: String) async -> String? {
        do {
            let client = try APIClient.make(from: text)
            try await client.login(passcode: passcode)
            let status = try await client.authStatus()
            try await enter(client: client, status: status)
            if case .signedOut = phase { return "Could not sign in." }
            return nil
        } catch let error as APIError {
            return error.errorDescription
        } catch {
            return "Could not sign in."
        }
    }

    @MainActor
    func logout() async {
        if let api = api { await api.logout() }
        store = nil
        phase = .signedOut(nil)
    }

    /// The server said the cookie is no good.
    @MainActor
    func sessionExpired() {
        store = nil
        phase = .signedOut("Locked. Enter the passcode.")
    }

    @MainActor
    func retry() async {
        phase = .checking
        await bootstrap()
    }
}
