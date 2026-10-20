import Foundation
import KitNet

// Opt-in, bounded live check of the production provider/cache on Apple's URLSession.
// Temporary files only; never reads the phone's library or changes favorites.
@main
struct HitomiLiveTests {
    static func main() async throws {
        setbuf(stdout, nil)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("hitomi-live-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let http = HTTPClient(.init(connectionsPerHost: 12, requestTimeout: 15, resourceTimeout: 30))
        defer { http.invalidate() }
        let provider = Hitomi(http: http)
        let cache = ImageCache(directory: root, http: http, hitomi: true)
        let found = try await provider.search("language:japanese artist:shimimaru", page: 1)
        guard !found.ids.isEmpty else { throw ProviderError.invalid("Live Nozomi intersection was empty") }
        let gallery = try await provider.gallery(4217619)
        let another = try await provider.gallery(2817148)
        let pages = Array(gallery.pages.prefix(12)) + Array(another.pages.prefix(12))
        for thumbnail in [false, true] {
            let start = Date()
            try await withThrowingTaskGroup(of: Void.self) { group in
                for page in pages {
                    group.addTask {
                        let key = thumbnail ? page.thumbnail : "hitomi:image:\(page.image)"
                        _ = try await cache.file(key) { stale in
                            if thumbnail { return (URL(string: page.thumbnail)!, provider.origin.absoluteString + "/") }
                            return try await provider.image(page, of: 4217619, stale: stale)
                        }
                    }
                }
                try await group.waitForAll()
            }
            print("PASS live \(thumbnail ? "thumbnails" : "originals"): \(pages.count) images, \(String(format: "%.3f", Date().timeIntervalSince(start))) s")
        }
        let mixedGallery = try await provider.gallery(2110975)
        let mixedPages = Array(mixedGallery.pages.prefix(12))
        let mixedStart = Date()
        try await withThrowingTaskGroup(of: Void.self) { group in
            for page in mixedPages {
                group.addTask {
                    _ = try await cache.file("hitomi:image:\(page.image)") { stale in try await provider.image(page, of: 2110975, stale: stale) }
                }
                group.addTask {
                    _ = try await cache.file(page.thumbnail) { _ in (URL(string: page.thumbnail)!, provider.origin.absoluteString + "/") }
                }
            }
            try await group.waitForAll()
        }
        print("PASS live mixed originals/thumbnails: \(mixedPages.count * 2) files, \(String(format: "%.3f", Date().timeIntervalSince(mixedStart))) s")
        let state = await cache.debugState
        guard state["shared"]?["peak"] == 4,
              state.values.allSatisfy({ $0["active"] == 0 && $0["queued"] == 0 }) else {
            throw ProviderError.invalid("Live admission limits not respected: \(state)")
        }
        let start = Date()
        for page in pages {
            _ = try await cache.file("hitomi:image:\(page.image)") { _ in throw ProviderError.invalid("A warm page used the network") }
        }
        print("PASS live warm cache: \(pages.count) files, \(String(format: "%.3f", Date().timeIntervalSince(start))) s; Nozomi results \(found.ids.count)")
        print("Admission counters: \(state)")
    }
}
