import Foundation
import KitCore

// What the list will show next, fetched ahead in the background so a fast scroll (down the list
// or along a strip) finds it on the phone: the galleries' details outwards from the row at the
// screen's middle (below first, then above), each followed by its strip's first screen of
// thumbnails (from where the strip was left), then the whole strips of the rows nearest the
// screen. What the screen shows asks for itself, at high priority and ahead of all this; the
// work here is low priority, a few at a time, and starts over from wherever the list is.
@MainActor
final class Prefetch {
    struct Focus: Equatable {
        var ids: [Int]
        var center: Int
        // Where each strip was left: its first visible thumbnail.
        var strips: [Int: Int]
    }

    private let app: AppController
    private var focus: Focus?
    private var worker: Task<Void, Never>?
    // Details as they arrive (the list keeps them, so a row coming into view has its strip).
    var ready: ((Int, GalleryInfo) -> Void)?

    init(app: AppController) { self.app = app }

    func start(_ new: Focus) {
        guard new != focus || worker == nil else { return }
        focus = new
        worker?.cancel()
        let details = app.details, images = app.images, referer = app.provider.origin.absoluteString + "/"
        // Imhentai answers through Cloudflare: fewer and nearer.
        let gentle = app.provider.id == .imhentai
        let window = gentle ? 60 : 150, width = gentle ? 2 : 4, strips = gentle ? 10 : 20, perScreen = 6
        let deliver: @Sendable (Int, GalleryInfo) -> Void = { [weak self] id, info in
            Task { @MainActor in self?.ready?(id, info) }
        }
        worker = Task.detached(priority: .utility) {
            let rows = Self.outwards(count: new.ids.count, center: new.center, window: window)
            // Details, then the first screen of each strip, a few rows at a time.
            await withTaskGroup(of: Void.self) { group in
                var running = 0
                for row in rows {
                    if Task.isCancelled { break }
                    if running >= width { await group.next(); running -= 1 }
                    let id = new.ids[row], start = new.strips[id] ?? 0
                    group.addTask {
                        guard let info = try? await details.info(id), !Task.isCancelled else { return }
                        deliver(id, info)
                        await Self.thumbnails(info, from: start, count: perScreen, images: images, referer: referer)
                    }
                    running += 1
                }
            }
            // Then whole strips, nearest rows first (each from where it was left).
            await withTaskGroup(of: Void.self) { group in
                var running = 0
                for row in rows.prefix(strips * 2 + 1) {
                    if Task.isCancelled { break }
                    if running >= width { await group.next(); running -= 1 }
                    let id = new.ids[row], start = new.strips[id] ?? 0
                    group.addTask {
                        guard let info = try? await details.info(id), !Task.isCancelled else { return }
                        await Self.thumbnails(info, from: start, count: info.pages.count, images: images, referer: referer)
                    }
                    running += 1
                }
            }
        }
    }

    // A strip's thumbnails from `start` outwards, `count` of them, onto the phone.
    private nonisolated static func thumbnails(_ info: GalleryInfo, from start: Int, count: Int, images: ImageCache, referer: String) async {
        let pages = info.pages
        guard !pages.isEmpty else { return }
        for index in outwards(count: pages.count, center: min(max(0, start), pages.count - 1), window: count) {
            if Task.isCancelled { return }
            let raw = pages[index].thumbnail
            await images.prefetch(raw) { _ in
                guard let url = URL(string: raw) else { throw ProviderError.invalid("Invalid thumbnail URL") }
                return (url, referer)
            }
        }
    }

    // Covered by another screen (a reader): what that screen needs goes first.
    func pause() {
        worker?.cancel()
        worker = nil
    }

    // Indices from `center` outwards (after, then before, alternately) within `window` of it.
    nonisolated static func outwards(count: Int, center: Int, window: Int) -> [Int] {
        guard count > 0 else { return [] }
        let center = min(max(0, center), count - 1)
        var result = [center]
        for distance in 1...max(1, window) {
            if center + distance < count { result.append(center + distance) }
            if center - distance >= 0 { result.append(center - distance) }
            if center + distance >= count && center - distance < 0 { break }
        }
        return result
    }
}
