import Foundation
import KitCore

// What the list will show next, fetched ahead in the background so a fast scroll (down the list
// or along a strip) finds it on the phone: the galleries' details outwards from the row at the
// screen's middle (below first, then above), each followed by its strip's first screen of
// thumbnails (from where the strip was left), then the whole strips of the rows nearest the
// screen. What the screen shows asks for itself, at high priority and ahead of all this; the
// work here is low priority, a few at a time, and starts over from wherever the list is.
@MainActor
public final class Prefetch {
    public struct Focus: Equatable, Sendable {
        var ids: [Int]
        var center: Int
        // Where each strip was left: its first visible thumbnail.
        var strips: [Int: Int]

        public init(ids: [Int], center: Int, strips: [Int: Int]) { self.ids = ids; self.center = center; self.strips = strips }
    }

    private let details: GalleryDetails
    private let media: GalleryMedia
    private var focus: Focus?
    private var worker: Task<Void, Never>?
    private var listOperation = OperationState()
    private var stripOperation = OperationState()
    private var readerOperation = OperationState()
    // Details as they arrive (the list keeps them, so a row coming into view has its strip).
    public var ready: ((Int, GalleryInfo) -> Void)?

    public init(details: GalleryDetails, media: GalleryMedia) { self.details = details; self.media = media }

    public func start(_ new: Focus) {
        guard new != focus || listOperation.phase == .idle else { return }
        focus = new
        // An open reader comes first; the list's work waits until its gallery is on the phone.
        guard !readerOperation.isRunning else { return }
        runList(new)
    }

    private func runList(_ new: Focus) {
        worker?.cancel()
        let operation = listOperation.begin()
        let details = details, media = media
        // Imhentai answers through Cloudflare: fewer and nearer.
        let policy = media.prefetchPolicy
        let window = policy.window, width = policy.width, strips = policy.strips, perScreen = 6
        let deliver: @Sendable (Int, GalleryInfo) -> Void = { [weak self] id, info in
            Task { @MainActor in
                guard let self, self.listOperation.owns(operation) else { return }
                self.ready?(id, info)
            }
        }
        let done: @Sendable () -> Void = { [weak self] in Task { @MainActor in self?.listDone(operation) } }
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
                        await Self.thumbnails(info, from: start, count: perScreen, media: media)
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
                        await Self.thumbnails(info, from: start, count: info.pages.count, media: media)
                    }
                    running += 1
                }
            }
            if !Task.isCancelled { done() }
        }
    }

    private func listDone(_ operation: OperationState.ID) {
        guard listOperation.finish(operation) else { return }
        worker = nil
    }

    // A strip's thumbnails from `start` outwards, `count` of them, onto the phone.
    private nonisolated static func thumbnails(_ info: GalleryInfo, from start: Int, count: Int, media: GalleryMedia) async {
        let pages = info.pages
        guard !pages.isEmpty else { return }
        for index in outwards(count: pages.count, center: min(max(0, start), pages.count - 1), window: count) {
            if Task.isCancelled { return }
            await media.prefetch(.thumbnail(pages[index]))
        }
    }

    // A strip being swiped: its thumbnails from where it is outwards, the way it moves first; the
    // nearest at high priority, then the rest of it, ahead of the list's own work.
    private var swiped: (id: Int, index: Int)?
    private var stripWorker: Task<Void, Never>?

    public func strip(_ id: Int, info: GalleryInfo, at index: Int) {
        if let swiped, swiped.id == id, abs(swiped.index - index) < 3 { return }
        let forward = swiped.map { $0.id != id || index >= $0.index } ?? true
        swiped = (id, index)
        stripWorker?.cancel()
        let operation = stripOperation.begin()
        let done: @Sendable () -> Void = { [weak self] in Task { @MainActor in self?.stripDone(operation) } }
        let media = media
        stripWorker = Task.detached(priority: .userInitiated) {
            let order = Self.outwards(count: info.pages.count, center: index, window: info.pages.count, forward: forward)
            await withTaskGroup(of: Void.self) { group in
                var running = 0
                for (rank, page) in order.enumerated() {
                    if Task.isCancelled { break }
                    if running >= 4 { await group.next(); running -= 1 }
                    let item = GalleryMedia.Item.thumbnail(info.pages[page])
                    let priority = rank < 12 ? URLSessionTask.highPriority : URLSessionTask.defaultPriority
                    group.addTask {
                        await media.prefetch(item, priority: priority)
                    }
                    running += 1
                }
            }
            if !Task.isCancelled { done() }
        }
    }

    private func stripDone(_ operation: OperationState.ID) {
        guard stripOperation.finish(operation) else { return }
        stripWorker = nil
    }

    // MARK: the reader first

    // An open reader comes before everything: its gallery's pages from where it is outwards, the
    // way it reads, the nearest at high priority and the rest at normal priority (the pages on
    // screen ask for themselves, first of all). Once all are on the phone, the list's work goes on
    // where it was (low priority).
    private var readingAt: (gallery: Int, index: Int)?
    private var readingOwner: ObjectIdentifier?
    private var readerWorker: Task<Void, Never>?

    public func reading(_ gallery: Int, info: GalleryInfo, at index: Int, owner: AnyObject) {
        let owner = ObjectIdentifier(owner)
        if readingOwner == owner, let readingAt, readingAt.gallery == gallery, abs(readingAt.index - index) < 3 { return }
        readingOwner = owner
        let forward = readingAt.map { $0.gallery != gallery || index >= $0.index } ?? true
        readingAt = (gallery, index)
        worker?.cancel(); listOperation.cancel()
        worker = nil
        stripWorker?.cancel(); stripOperation.cancel()
        stripWorker = nil
        readerWorker?.cancel()
        let operation = readerOperation.begin()
        let media = media
        let done: @Sendable () -> Void = { [weak self] in Task { @MainActor in self?.readerDone(operation) } }
        readerWorker = Task.detached(priority: .userInitiated) {
            let order = Self.outwards(count: info.pages.count, center: index, window: info.pages.count, forward: forward)
            await withTaskGroup(of: Void.self) { group in
                var running = 0
                for (rank, number) in order.enumerated() {
                    if Task.isCancelled { break }
                    if running >= 4 { await group.next(); running -= 1 }
                    let page = info.pages[number]
                    let priority = rank < 6 ? URLSessionTask.highPriority : URLSessionTask.defaultPriority
                    group.addTask {
                        await media.prefetch(.original(gallery: gallery, page: page), priority: priority)
                    }
                    running += 1
                }
            }
            guard !Task.isCancelled else { return }
            done()
        }
    }

    private func readerDone(_ operation: OperationState.ID) {
        guard readerOperation.finish(operation) else { return }
        readerWorker = nil
        if let focus { runList(focus) }
    }

    // The reader closed: the list (on screen again) starts its own work.
    public func closedReader(owner: AnyObject) {
        // UIKit may finish removing the previous screen after its replacement
        // has already appeared. Only that screen's owner may release the work.
        guard readingOwner == ObjectIdentifier(owner) else { return }
        readingOwner = nil
        readerOperation.cancel()
        readerWorker?.cancel()
        readerWorker = nil
        readingAt = nil
    }

    // Covered by another screen (a reader): what that screen needs goes first.
    public func pause() {
        listOperation.cancel(); stripOperation.cancel()
        worker?.cancel()
        worker = nil
        stripWorker?.cancel()
        stripWorker = nil
        swiped = nil
    }

    // Indices from `center` outwards within `window` of it, alternately after and before (before
    // and after when not `forward`).
    nonisolated static func outwards(count: Int, center: Int, window: Int, forward: Bool = true) -> [Int] {
        guard count > 0 else { return [] }
        let center = min(max(0, center), count - 1)
        var result = [center]
        for distance in 1...max(1, window) {
            let ahead = center + distance, behind = center - distance
            for index in forward ? [ahead, behind] : [behind, ahead] where index >= 0 && index < count { result.append(index) }
            if ahead >= count && behind < 0 { break }
        }
        return result
    }
}
