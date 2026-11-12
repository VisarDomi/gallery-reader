import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import KitCore
import KitNet

// The PC from anywhere. Its two servers (this repository's backups, Gallery Downloader's
// favorites) answer at home on the LAN and, away from home, at a public address that forwards
// to them. A request goes to the home address first, briefly, trusting only the bundled CA for
// that host. When the home address cannot be reached (a transport failure: no route, refused,
// timed out, a certificate that is not the PC's), the same request goes to the public address
// with the system's ordinary certificate trust and more time. An HTTP status from either
// address is the PC's answer and is final. The same rule as Guidance's Store.request.

// After a failed home attempt the home address is skipped for a while (45 s), so a phone away
// from home pays the short wait once, not on every request. One gate serves both servers:
// they are the same PC.
public final class HomeGate: @unchecked Sendable {
    private let lock = NSLock()
    private let pause: Duration
    private let now: @Sendable () -> ContinuousClock.Instant
    private var failure: ContinuousClock.Instant?

    public init(pause: Duration = .seconds(45), now: @escaping @Sendable () -> ContinuousClock.Instant = { ContinuousClock.now }) {
        self.pause = pause
        self.now = now
    }

    public var isOpen: Bool { lock.withLock { failure.map { now() - $0 > pause } ?? true } }
    public func failed() { lock.withLock { failure = now() } }
}

public final class PCRoute: Sendable {
    public enum Address: String, Sendable { case home, away = "public" }

    // The server's base address at home, and its public one (nil: this server is home-only).
    public let home: URL
    public let away: URL?
    private let homeClient: HTTPClient
    private let awayClient: HTTPClient
    private let awayHeaders: [String: String]
    private let gate: HomeGate
    private let last = Last()

    // `awayHeaders` go to the public address only (the key its gateway asks for). Only an
    // https public address is used. `configure` is the tests' stub transport.
    public init(home: URL, trust: LocalTrust?, away: URL?, awayHeaders: [String: String] = [:], gate: HomeGate,
                homeTimeout: TimeInterval = 2, awayTimeout: TimeInterval = 18,
                configure: (@Sendable (URLSessionConfiguration) -> Void)? = nil) {
        self.home = home
        self.away = away.flatMap { $0.scheme?.lowercased() == "https" && $0.host != nil ? $0 : nil }
        self.awayHeaders = awayHeaders
        self.gate = gate
        // Home: `homeTimeout` without progress gives up; a transfer that moves keeps the 8 s
        // the PC calls always had.
        homeClient = HTTPClient(.init(trust: trust, connectionsPerHost: 2, requestTimeout: homeTimeout, resourceTimeout: max(8, homeTimeout),
                                      configure: configure))
        awayClient = HTTPClient(.init(connectionsPerHost: 2, requestTimeout: awayTimeout, resourceTimeout: awayTimeout + 12, configure: configure))
        budget = max(8, homeTimeout) + awayTimeout + 12 + 5
    }

    // The longest both attempts can take together.
    public let budget: TimeInterval

    // HTTPClient.send for a request addressed to the home server: its answer, HTTPStatusError
    // for a status outside 2xx and `accept`, or the transport error of the last address tried.
    // Never retried here (PC calls do not retry).
    public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        guard serves(request.url) else { throw URLError(.unsupportedURL) }
        var attempt = request
        attempt.retry = .never
        attempt.accept = Set(100...599)
        let answer: HTTPResponse
        if let detour = awayRequest(attempt) {
            if gate.isOpen {
                do { answer = try await answered(.home, homeClient.send(attempt)) }
                catch {
                    // The caller gave up: not the home address's failure.
                    if Task.isCancelled { throw error }
                    gate.failed()
                    Log.network.info("PC home address did not answer (\(error.localizedDescription, privacy: .public)); using the public one")
                    answer = try await answered(.away, awayClient.send(detour))
                }
            } else {
                answer = try await answered(.away, awayClient.send(detour))
            }
        } else {
            answer = try await answered(.home, homeClient.send(attempt))
        }
        guard (200..<300).contains(answer.status) || request.accept.contains(answer.status) else {
            throw HTTPStatusError(status: answer.status, url: answer.url, body: answer.data)
        }
        return answer
    }

    // Which address answered last, with which status (the apps' debug state).
    public var lastAnswer: String? { last.value }

    private func answered(_ address: Address, _ response: HTTPResponse) -> HTTPResponse {
        last.set("\(address.rawValue) \(response.status) \(ISO8601DateFormatter().string(from: Date()))")
        return response
    }

    // Whether `url` is on the home server (same scheme, host and port, under its base path).
    public func serves(_ url: URL) -> Bool { resource(of: url) != nil }

    // The path below the home base ("/api/…"), percent-encoded as sent; nil when `url` is elsewhere.
    private func resource(of url: URL) -> String? {
        guard let base = URLComponents(url: home, resolvingAgainstBaseURL: true), let asked = URLComponents(url: url, resolvingAgainstBaseURL: true),
              let scheme = asked.scheme?.lowercased(), scheme == base.scheme?.lowercased(),
              let host = asked.host?.lowercased(), host == base.host?.lowercased(),
              (asked.port ?? Self.defaultPort(scheme)) == (base.port ?? Self.defaultPort(scheme)) else { return nil }
        let prefix = Self.withoutTrailingSlash(base.percentEncodedPath)
        let path = asked.percentEncodedPath
        guard path.hasPrefix(prefix) else { return nil }
        let rest = String(path.dropFirst(prefix.count))
        guard rest.isEmpty || rest.hasPrefix("/") else { return nil }
        return rest
    }

    // The same request at the public address: the same path below the public base, the same
    // query, method, headers and body, plus the public address's own headers.
    private func awayRequest(_ request: HTTPRequest) -> HTTPRequest? {
        guard let away, let rest = resource(of: request.url), var parts = URLComponents(url: away, resolvingAgainstBaseURL: true) else { return nil }
        parts.percentEncodedPath = Self.withoutTrailingSlash(parts.percentEncodedPath) + rest
        parts.percentEncodedQuery = URLComponents(url: request.url, resolvingAgainstBaseURL: true)?.percentEncodedQuery
        parts.fragment = nil
        guard let url = parts.url else { return nil }
        var detour = request
        detour.url = url
        detour.headers.merge(awayHeaders) { _, own in own }
        return detour
    }

    private static func defaultPort(_ scheme: String) -> Int { scheme == "http" ? 80 : 443 }
    private static func withoutTrailingSlash(_ path: String) -> String { path.hasSuffix("/") ? String(path.dropLast()) : path }

    private final class Last: @unchecked Sendable {
        private let lock = NSLock()
        private var text: String?
        var value: String? { lock.withLock { text } }
        func set(_ value: String) { lock.withLock { text = value } }
    }
}

// NativeKit's PCBackup knows one base address and owns its client. `carrier()`, given as that
// client's `configure`, puts this route under it: the client's requests for the home address
// are carried by the route (home first, then public) and the answer is handed back with its
// status, whatever it is. A request the route does not serve loads as before.
extension PCRoute {
    public func carrier() -> @Sendable (URLSessionConfiguration) -> Void {
        PCRouteCarrier.add(self)
        let budget = budget
        return { configuration in
            configuration.protocolClasses = [PCRouteCarrier.self] + (configuration.protocolClasses ?? [])
            // The client's own timers must not cut the two attempts short.
            configuration.timeoutIntervalForRequest = budget
            configuration.timeoutIntervalForResource = budget
        }
    }
}

final class PCRouteCarrier: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var routes: [PCRoute] = []

    static func add(_ route: PCRoute) {
        lock.withLock {
            routes.removeAll { $0.home == route.home }
            routes.append(route)
        }
    }

    private static func route(for url: URL?) -> PCRoute? {
        guard let url else { return nil }
        return lock.withLock { routes.first { $0.serves(url) } }
    }

    private var work: Task<Void, Never>?

    override class func canInit(with request: URLRequest) -> Bool { route(for: request.url) != nil }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let route = Self.route(for: url) else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL))
            return
        }
        // URLSession hands a protocol the body as a stream on Apple platforms.
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read)
        let forwarded = HTTPRequest(url, method: request.httpMethod ?? "GET", headers: request.allHTTPHeaderFields ?? [:], body: body,
                                    retry: .never, accept: Set(100...599))
        // The loading system owns this object; the task reports back through it.
        let loading = Unchecked(value: self)
        work = Task {
            let this = loading.value
            do {
                let answer = try await route.send(forwarded)
                guard !Task.isCancelled else { return }
                // The decoded body is handed over: headers describing the wire form do not apply.
                var headers: [String: String] = [:]
                for (name, value) in answer.response.allHeaderFields {
                    guard let name = name as? String, let value = value as? String,
                          !["content-encoding", "content-length", "transfer-encoding"].contains(name.lowercased()) else { continue }
                    headers[name] = value
                }
                guard let response = HTTPURLResponse(url: url, statusCode: answer.status, httpVersion: "HTTP/1.1", headerFields: headers) else {
                    this.client?.urlProtocol(this, didFailWithError: URLError(.badServerResponse))
                    return
                }
                this.client?.urlProtocol(this, didReceive: response, cacheStoragePolicy: .notAllowed)
                this.client?.urlProtocol(this, didLoad: answer.data)
                this.client?.urlProtocolDidFinishLoading(this)
            } catch {
                guard !Task.isCancelled else { return }
                this.client?.urlProtocol(this, didFailWithError: error)
            }
        }
    }

    private struct Unchecked<Value>: @unchecked Sendable { let value: Value }

    override func stopLoading() { work?.cancel() }

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 64 << 10)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
}
