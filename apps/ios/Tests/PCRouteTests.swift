import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import KitNet

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { print("FAIL: " + message); exit(1) }
}

// A scripted transport for the PC's two addresses: each host answers with a status or fails
// like a network would. It records what was asked, with the gateway key it carried.
final class PCStub: URLProtocol, @unchecked Sendable {
    enum Answer { case status(Int), failure(URLError.Code) }
    static let lock = NSLock()
    nonisolated(unsafe) static var answers: [String: Answer] = [:]
    nonisolated(unsafe) static var seen: [String] = []

    static func script(_ answers: [String: Answer]) { lock.withLock { self.answers = answers; seen = [] } }
    static func asked() -> [String] { lock.withLock { seen } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!
        let answer = Self.lock.withLock { () -> Answer? in
            let key = request.value(forHTTPHeaderField: "X-PC-Apps-Key").map { " key=" + $0 } ?? ""
            Self.seen.append((request.httpMethod ?? "GET") + " " + url.absoluteString + key)
            return Self.answers[url.host!]
        }
        switch answer {
        case .status(let status):
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: [:])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(url.host!.utf8))
            client?.urlProtocolDidFinishLoading(self)
        case .failure(let code): client?.urlProtocol(self, didFailWithError: URLError(code))
        case nil: client?.urlProtocol(self, didFailWithError: URLError(.cannotFindHost))
        }
    }
    override func stopLoading() {}
}

// A clock the test moves (HomeGate's 45 s).
final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var instant = ContinuousClock.now
    var now: ContinuousClock.Instant { lock.withLock { instant } }
    func advance(_ duration: Duration) { lock.withLock { instant += duration } }
}

// The PC from anywhere (PCRoute): home first, the public address only when home does not
// answer, 45 s without home after that, an HTTP status final, the key only on the public one.
@main
struct PCRouteTests {
    static let home = "192.168.1.197", away = "pc.example.test"
    static let favorites = URL(string: "https://192.168.1.197:7777/api/favorites/hitomi")!

    static func route(_ clock: TestClock, away: String? = "https://pc.example.test/gallery") -> PCRoute {
        PCRoute(home: URL(string: "https://192.168.1.197:7777")!, trust: nil, away: away.flatMap(URL.init(string:)),
                awayHeaders: ["X-PC-Apps-Key": "fixture"], gate: HomeGate(now: { clock.now }),
                configure: { $0.protocolClasses = [PCStub.self] })
    }

    static func put(_ pc: PCRoute) async -> Result<HTTPResponse, Error> {
        do { return .success(try await pc.send(HTTPRequest(favorites, method: "PUT", headers: ["Content-Type": "application/json"], body: Data("{}".utf8)))) }
        catch { return .failure(error) }
    }

    static func main() async throws {
        let homeURL = "PUT https://192.168.1.197:7777/api/favorites/hitomi"
        let awayURL = "PUT https://pc.example.test/gallery/api/favorites/hitomi key=fixture"

        // Home answers: one request, no key, the public address is never asked.
        var clock = TestClock(), pc = route(clock)
        PCStub.script([home: .status(200), away: .status(200)])
        guard case .success(let first) = await put(pc) else { return expect(false, "home answer") }
        expect(first.status == 200 && PCStub.asked() == [homeURL], "home first, alone, without the gateway key: \(PCStub.asked())")
        expect(pc.lastAnswer?.hasPrefix("home 200") == true, "the debug state names the address that answered")

        // A status from home is the PC's answer: no fallback.
        PCStub.script([home: .status(500), away: .status(200)])
        if case .failure(let error) = await put(pc) { expect((error as? HTTPStatusError)?.status == 500, "home's status is the error") }
        else { expect(false, "a 500 from home must fail") }
        expect(PCStub.asked() == [homeURL], "an HTTP status from home is final: \(PCStub.asked())")

        // A transport failure at home moves the same request to the public address, with the key.
        clock = TestClock(); pc = route(clock)
        PCStub.script([home: .failure(.cannotConnectToHost), away: .status(200)])
        guard case .success(let moved) = await put(pc) else { return expect(false, "public answer") }
        expect(moved.status == 200 && PCStub.asked() == [homeURL, awayURL], "home, then public with the key: \(PCStub.asked())")
        expect(pc.lastAnswer?.hasPrefix("public 200") == true, "the debug state names the public address")

        // Home is skipped for 45 s after it failed, then tried again.
        PCStub.script([home: .status(200), away: .status(200)])
        _ = await put(pc)
        expect(PCStub.asked() == [awayURL], "within 45 s only the public address is asked: \(PCStub.asked())")
        clock.advance(.seconds(46))
        PCStub.script([home: .status(200), away: .status(200)])
        _ = await put(pc)
        expect(PCStub.asked() == [homeURL], "after 45 s home is asked again: \(PCStub.asked())")

        // A status from the public address is final too.
        clock = TestClock(); pc = route(clock)
        PCStub.script([home: .failure(.timedOut), away: .status(401)])
        if case .failure(let error) = await put(pc) { expect((error as? HTTPStatusError)?.status == 401, "the public status is the error") }
        else { expect(false, "a 401 from the public address must fail") }

        // Without a public address (or with one that is not https) the server is home-only.
        for address in [nil, "http://pc.example.test/gallery"] as [String?] {
            pc = route(TestClock(), away: address)
            PCStub.script([home: .failure(.cannotConnectToHost), away: .status(200)])
            if case .success = await put(pc) { expect(false, "home-only must fail when home is unreachable") }
            expect(PCStub.asked() == [homeURL], "home-only asks home alone: \(PCStub.asked())")
        }

        // A request for another server is refused, not sent anywhere.
        PCStub.script([home: .status(200)])
        do { _ = try await route(TestClock()).send(HTTPRequest(URL(string: "https://192.168.1.197:9999/api/videos")!)); expect(false, "another server must be refused") }
        catch { expect(PCStub.asked().isEmpty, "nothing is sent for a URL the route does not serve") }

        print("PASS: the PC's servers are asked at home first, then at their public address")
    }
}
