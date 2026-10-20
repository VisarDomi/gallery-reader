import Foundation
import KitNet

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { print("FAIL: " + message); exit(1) }
}

// A stub transport: /gone answers 404, /image a picture, /slow never answers (until stopped).
final class Fixture: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var requests: [String: Int] = [:]
    nonisolated(unsafe) static var stopped: [String] = []
    nonisolated(unsafe) static var held: [String: [Fixture]] = [:]
    static let lock = NSLock()
    static func finish(_ path: String) {
        let fixtures = lock.withLock { held.removeValue(forKey: path) ?? [] }
        for fixture in fixtures { fixture.answer(status: 200) }
    }
    static func count(_ path: String) -> Int { lock.withLock { requests[path, default: 0] } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!
        Self.lock.withLock { Self.requests[url.path, default: 0] += 1 }
        if url.path.hasPrefix("/hold") { Self.lock.withLock { Self.held[url.path, default: []].append(self) }; return }
        guard !url.path.hasPrefix("/slow") else { return }
        if url.path == "/throttle" { answer(status: Self.count(url.path) == 1 ? 503 : 200); return }
        answer(status: url.path == "/image" ? 200 : 404)
    }
    private func answer(status: Int) {
        let found = status == 200
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": found ? "image/png" : "text/html", "Retry-After": "1"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: found ? Data([1, 2, 3, 4]) : Data())
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { Self.lock.withLock { Self.stopped.append(request.url!.path) } }
}

@main
struct CacheTests {
    static func wait(_ condition: () -> Bool) async throws {
        for _ in 0..<200 { if condition() { return }; try await Task.sleep(for: .milliseconds(10)) }
        expect(false, "Timed out waiting for the fixture")
    }

    static func gateTests() async throws {
        let gate = ImageTransferGate(limit: 2, speculativeLimit: 1, firstCooldown: 0.01)
        let speculative = UUID(), queued = UUID(), onScreen = UUID(), next = UUID()
        try await gate.acquire(speculative, priority: 0.1, speculative: true)
        let ahead = Task { try await gate.acquire(queued, priority: 0.9, speculative: true) }
        try await Task.sleep(for: .milliseconds(20))
        try await gate.acquire(onScreen, priority: 1, speculative: false)
        let visible = Task { try await gate.acquire(next, priority: 1, speculative: false) }
        try await Task.sleep(for: .milliseconds(20))
        await gate.release(onScreen)
        try await visible.value
        var snapshot = await gate.state
        expect(snapshot["active"] == 2 && snapshot["queued"] == 1, "Visible requests use the reserved slot ahead of speculation")
        await gate.release(speculative)
        try await ahead.value
        await gate.release(queued)
        let cancelledID = UUID()
        try await gate.acquire(onScreen, priority: 1, speculative: false)
        let cancelled = Task { try await gate.acquire(cancelledID, priority: 1, speculative: false) }
        try await Task.sleep(for: .milliseconds(20))
        cancelled.cancel()
        do { try await cancelled.value; expect(false, "A cancelled queued request must fail") } catch {}
        await gate.release(onScreen)
        await gate.release(next, error: HTTPStatusError(status: 429, url: nil, retryAfter: 0.15))
        let start = Date()
        try await gate.acquire(UUID(), priority: 1, speculative: false)
        snapshot = await gate.state
        expect(Date().timeIntervalSince(start) >= 0.14 && snapshot["throttles"] == 1 && snapshot["peak"] == 2,
               "All requests respect Retry-After and the global cap")
        print("PASS: global concurrency, reserved visible slot, queued cancellation, shared Retry-After")
    }

    static func main() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let http = HTTPClient(.init(configure: { $0.protocolClasses = [Fixture.self] }))
        let cache = ImageCache(directory: root, http: http)
        let source: @Sendable (Bool) async throws -> (url: URL, referer: String) = { stale in
            (URL(string: stale ? "https://fixture.test/image" : "https://fixture.test/gone")!, "https://fixture.test/")
        }
        async let first = cache.file("page", source: source)
        async let second = cache.file("page", source: source)
        let (a, b) = try await (first, second)
        expect(a == b && (try? Data(contentsOf: a)) == Data([1, 2, 3, 4]), "Both callers get the image")
        expect(Fixture.count("/gone") == 1 && Fixture.count("/image") == 1, "One shared transfer, asking the source again after a 404")
        let reopened = ImageCache(directory: root, http: http)
        _ = try await reopened.file("page", source: source)
        expect(Fixture.count("/image") == 1, "A finished image is reused after a relaunch")
        print("PASS: shared transfer, stale source retry, disk reuse")

        let slow: @Sendable (Bool) async throws -> (url: URL, referer: String) = { _ in (URL(string: "https://fixture.test/slow")!, "") }
        let abandoned = Task { try await cache.file("slow", source: slow) }
        for _ in 0..<200 where Fixture.count("/slow") == 0 { try await Task.sleep(for: .milliseconds(10)) }
        abandoned.cancel()
        var ended = false
        for _ in 0..<200 {
            if Fixture.lock.withLock({ Fixture.stopped.contains("/slow") }) { ended = true; break }
            try await Task.sleep(for: .milliseconds(10))
        }
        expect(ended, "A transfer every caller gave up stops")
        do { _ = try await abandoned.value; expect(false, "The abandoned caller fails") } catch {}
        print("PASS: abandoned transfers stop")

        let aheadSource: @Sendable (Bool) async throws -> (url: URL, referer: String) = { _ in (URL(string: "https://fixture.test/slow-prefetch")!, "") }
        let ahead = Task { await cache.prefetch("prefetch-cancel", source: aheadSource) }
        try await wait { Fixture.count("/slow-prefetch") == 1 }
        ahead.cancel()
        try await wait { Fixture.lock.withLock { Fixture.stopped.contains("/slow-prefetch") } }
        await ahead.value
        print("PASS: cancelling a speculative owner cancels its actual download")

        let heldSource: @Sendable (Bool) async throws -> (url: URL, referer: String) = { _ in (URL(string: "https://fixture.test/hold-promote")!, "") }
        let prefetched = Task { await cache.prefetch("promote", source: heldSource) }
        try await wait { Fixture.count("/hold-promote") == 1 }
        let visible = Task { try await cache.file("promote", source: heldSource) }
        try await Task.sleep(for: .milliseconds(50))
        Fixture.finish("/hold-promote")
        _ = try await visible.value
        await prefetched.value
        expect(Fixture.count("/hold-promote") == 1, "A visible caller promotes and shares a prefetch without restarting it")

        let sharedSource: @Sendable (Bool) async throws -> (url: URL, referer: String) = { _ in (URL(string: "https://fixture.test/hold-shared")!, "") }
        let owner = Task { try await cache.file("shared-cancel", source: sharedSource) }
        try await wait { Fixture.count("/hold-shared") == 1 }
        let survivor = Task { try await cache.file("shared-cancel", source: sharedSource) }
        try await Task.sleep(for: .milliseconds(30))
        owner.cancel()
        try await Task.sleep(for: .milliseconds(30))
        let third = Task { try await cache.file("shared-cancel", source: sharedSource) }
        try await Task.sleep(for: .milliseconds(30))
        Fixture.finish("/hold-shared")
        _ = try await survivor.value
        _ = try await third.value
        do { _ = try await owner.value; expect(false, "A cancelled caller fails") } catch {}
        expect(Fixture.count("/hold-shared") == 1, "Cancelling one caller never drops the surviving shared transfer")
        print("PASS: promotion and partial cancellation preserve shared bytes")

        let throttleSource: @Sendable (Bool) async throws -> (url: URL, referer: String) = { _ in (URL(string: "https://fixture.test/throttle")!, "") }
        let began = Date()
        _ = try await cache.file("hitomi:image:throttle", source: throttleSource)
        expect(Fixture.count("/throttle") == 2 && Date().timeIntervalSince(began) >= 1.9, "503 waits for the shared cooldown before retrying")
        try await gateTests()


        let kept = CachedSearch(query: "q", ids: [5, 4, 3], total: 30, complete: false, pages: 2, savedAt: .distantPast)
        let prepended = SearchCache.merge(kept, fresh: SearchPage(ids: [7, 6, 5, 4], total: 32, complete: false), query: "q", paged: true)
        expect(prepended.ids == [7, 6, 5, 4, 3] && prepended.pages == 2 && prepended.total == 32, "Imhentai puts new results in front")
        let moved = SearchCache.merge(kept, fresh: SearchPage(ids: [9, 8], total: 40, complete: false), query: "q", paged: true)
        expect(moved.ids == [9, 8] && moved.pages == 1, "No overlap replaces the kept results")
        let hitomi = SearchCache.merge(kept, fresh: SearchPage(ids: [1, 2], total: 2, complete: true), query: "q", paged: false)
        expect(hitomi.ids == [1, 2] && hitomi.complete, "Hitomi's complete answer replaces")
        let next = SearchCache.append(prepended, page: SearchPage(ids: [3, 2, 1], total: 32, complete: true))
        expect(next.ids == [7, 6, 5, 4, 3, 2, 1] && next.pages == 3 && next.complete, "The next page appends without repeats")
        print("PASS: search merges")
    }
}
