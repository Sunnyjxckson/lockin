import Foundation

/// Typed failures the screens can show.
public enum APIError: Error, Equatable, LocalizedError {
    case invalidURL
    /// No network, or the server did not answer.
    case offline
    /// The cookie is missing or expired. Show the login screen.
    case unauthorized
    case wrongPasscode
    /// Too many tries. The message says how long to wait.
    case locked(String)
    /// The server answered with an error. Message and HTTP status.
    case server(String, Int)
    case badResponse

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "That server address does not look right."
        case .offline: return "Could not reach the server."
        case .unauthorized: return "Locked. Enter the passcode."
        case .wrongPasscode: return "Wrong passcode."
        case .locked(let m): return m
        case .server(let m, _): return m
        case .badResponse: return "The server sent something unexpected."
        }
    }

    public var isOffline: Bool {
        if case .offline = self { return true }
        return false
    }
}

/// What /api/auth/status says.
public struct AuthStatus: Decodable, Equatable {
    /// "server": a passcode is set and the cookie decides. "local": no server passcode.
    public var mode: String
    public var authed: Bool
    public var problem: String?

    public init(mode: String, authed: Bool, problem: String? = nil) {
        self.mode = mode
        self.authed = authed
        self.problem = problem
    }
}

/// One place that talks HTTP to the Vercel app. The cookie jar lives in the app group so the extensions share the session.
public final class APIClient: @unchecked Sendable {
    public private(set) var baseURL: URL
    public let session: URLSession

    public init(baseURL: URL, session: URLSession? = nil) {
        self.baseURL = baseURL
        self.session = session ?? APIClient.makeSession()
    }

    /// Builds a client from a typed address. Adds https:// when the scheme is missing.
    public static func make(from text: String, session: URLSession? = nil) throws -> APIClient {
        guard let url = APIClient.normalize(text) else { throw APIError.invalidURL }
        return APIClient(baseURL: url, session: session)
    }

    public static func normalize(_ text: String) -> URL? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") {
            s = "https://" + s
        }
        while s.hasSuffix("/") { s.removeLast() }
        guard let url = URL(string: s), url.host != nil else { return nil }
        return url
    }

    public static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.sharedCookieStorage(forGroupContainerIdentifier: AppGroup.id)
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 25
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }

    // MARK: raw requests

    public func send(path: String, method: String = "POST", body: Data? = nil) async throws -> (Data, Int) {
        guard let url = URL(string: baseURL.absoluteString + path) else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        if let body = body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
            return (data, http.statusCode)
        } catch let error as APIError {
            throw error
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw APIError.offline
        }
    }

    private struct ErrorBody: Decodable {
        var error: String?
    }

    static func errorMessage(from data: Data) -> String? {
        let body = try? JSONDecoder().decode(ErrorBody.self, from: data)
        return body?.error
    }

    // MARK: auth

    /// Sets the session cookie when the passcode is right.
    public func login(passcode: String) async throws {
        let body = try JSONEncoder().encode(["passcode": passcode])
        let (data, status) = try await send(path: "/api/auth/login", method: "POST", body: body)
        if (200..<300).contains(status) { return }
        let message = APIClient.errorMessage(from: data)
        if status == 401 { throw APIError.wrongPasscode }
        if status == 429 { throw APIError.locked(message ?? "Too many tries. Wait a bit.") }
        throw APIError.server(message ?? "Could not sign in.", status)
    }

    public func authStatus() async throws -> AuthStatus {
        let (data, status) = try await send(path: "/api/auth/status", method: "GET")
        guard (200..<300).contains(status) else {
            throw APIError.server(APIClient.errorMessage(from: data) ?? "Could not check the session.", status)
        }
        guard let parsed = try? JSONDecoder().decode(AuthStatus.self, from: data) else { throw APIError.badResponse }
        return parsed
    }

    public func logout() async {
        _ = try? await send(path: "/api/auth/logout", method: "POST", body: Data("{}".utf8))
        if let storage = session.configuration.httpCookieStorage {
            for cookie in storage.cookies ?? [] {
                if cookie.name == "lockin_session" { storage.deleteCookie(cookie) }
            }
        }
    }
}
