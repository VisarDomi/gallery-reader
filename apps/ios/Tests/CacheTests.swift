import Foundation
import KitNet

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { print("FAIL: " + message); exit(1) }
}

// A stub transport: /gone answers 404, /image a picture, /slow never answers (until stopped).
final class Fixture: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var requests: [String: Int] = [:]
    nonisolated(unsafe) static var stopped: [String] = []
    static let lock = NSLock()
    static func count(_ path: String) -> Int { lock.withLock { requests[path, default: 0] } }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!
        Self.lock.withLock { Self.requests[url.path, default: 0] += 1 }
        guard url.path != "/slow" else { return }
        let found = url.path == "/image"
        let response = HTTPURLResponse(url: url, statusCode: found ? 200 : 404, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": found ? "image/png" : "text/html"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: found ? Data([1, 2, 3, 4]) : Data())
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { Self.lock.withLock { Self.stopped.append(request.url!.path) } }
}

@main
struct CacheTests {
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
