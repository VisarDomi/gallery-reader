import Foundation
import KitImages
import KitNet

// The provider/cache boundary: callers name an image, rather than constructing
// cache keys, Referers, stale-host retries or provider-specific transfer policy.
final class GalleryMedia: Sendable {
    enum Item: Sendable {
        case thumbnail(GalleryInfo.Page)
        case original(gallery: Int, page: GalleryInfo.Page)
    }
    struct PrefetchPolicy: Sendable { let window: Int; let width: Int; let strips: Int }
    private let provider: any GalleryProvider
    private let cache: ImageCache

    init(provider: any GalleryProvider, directory: URL, http: HTTPClient) {
        self.provider = provider
        cache = ImageCache(directory: directory, http: http, hitomi: provider.id == .hitomi)
    }

    var prefetchPolicy: PrefetchPolicy {
        provider.id == .imhentai ? .init(window: 60, width: 2, strips: 10) : .init(window: 150, width: 4, strips: 20)
    }

    func key(for item: Item) -> String {
        switch item {
        case .thumbnail(let page): page.thumbnail
        case .original(_, let page): "\(provider.id.rawValue):image:\(page.image)"
        }
    }

    func source(_ item: Item) -> ImageSource {
        .load { [self] in try await cache.file(key(for: item)) { stale in try await self.resolve(item, stale: stale) } }
    }
    func cachedFile(_ item: Item) -> URL? { cache.localFile(key(for: item)) }

    func prefetch(_ item: Item, priority: Float = URLSessionTask.lowPriority) async {
        await cache.prefetch(key(for: item), priority: priority) { [self] stale in try await resolve(item, stale: stale) }
    }
    func trim() async { await cache.trim(limit: 2 << 30) }
    var statistics: [String: [String: Int]] { get async { await cache.debugState } }

    private func resolve(_ item: Item, stale: Bool) async throws -> (url: URL, referer: String) {
        switch item {
        case .thumbnail(let page):
            guard let url = URL(string: page.thumbnail) else { throw ProviderError.invalid("Invalid thumbnail URL") }
            return (url, provider.origin.absoluteString + "/")
        case .original(let gallery, let page): return try await provider.image(page, of: gallery, stale: stale)
        }
    }
}
