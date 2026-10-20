import CryptoKit
import Foundation
import KitCore
import KitNet

// Gallery details, kept on the phone so rows, readers and info sheets show at once and offline
// (galleries/<id>.json; details do not change once published).
actor GalleryDetails {
    private let provider: any GalleryProvider
    private let directory: URL
    private var memory: [Int: GalleryInfo] = [:]
    private var order: [Int] = []
    private var loading: [Int: Task<GalleryInfo, Error>] = [:]

    init(provider: any GalleryProvider, directory: URL) {
        self.provider = provider
        self.directory = directory.appendingPathComponent("galleries")
    }

    // The phone's copy read on the calling thread (a relaunch shows rows and readers in their
    // first frame).
    nonisolated func infoNow(_ id: Int) -> GalleryInfo? {
        guard let saved = try? DurableFile.readJSON(GalleryInfo.self, from: directory.appendingPathComponent("\(id).json")), !saved.pages.isEmpty else { return nil }
        return saved
    }

    func info(_ id: Int) async throws -> GalleryInfo {
        if let cached = memory[id] { return cached }
        let file = directory.appendingPathComponent("\(id).json")
        if let saved = try? DurableFile.readJSON(GalleryInfo.self, from: file), !saved.pages.isEmpty {
            remember(saved)
            return saved
        }
        if let task = loading[id] { return try await task.value }
        let task = Task { [provider] in try await provider.gallery(id) }
        loading[id] = task
        defer { loading[id] = nil }
        let info = try await task.value
        remember(info)
        if !info.pages.isEmpty { try? DurableFile.writeJSON(info, to: file) }
        return info
    }

    private func remember(_ info: GalleryInfo) {
        if memory[info.id] == nil { order.append(info.id) }
        memory[info.id] = info
        if order.count > 400 { memory[order.removeFirst()] = nil }
    }
}

final class NameMemo: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String] = [:]
    func value(_ key: String) -> String? { lock.withLock { values[key] } }
    func set(_ key: String, _ value: String) {
        lock.withLock {
            if values.count > 50_000 { values.removeAll(keepingCapacity: true) }
            values[key] = value
        }
    }
}

// Images on the phone (cache/<sha256(key)> with a .mime file, the web version's format):
// read when saved, otherwise downloaded once (requests for the same image share it). The
// folder is kept under a size limit, least recently used first.
actor ImageCache {
    // One transfer per image, shared by its callers; it stops when every caller gave up (a
    // page scrolled away), so the screen's pages get the connections.
    private struct Transfer {
        let id: UUID
        let task: Task<URL, Error>
        var callers: Set<UUID> = []
    }

    private let directory: URL
    private let http: HTTPClient
    private var loading: [String: Transfer] = [:]
    private let originals: ImageTransferGate
    private let thumbnails: ImageTransferGate

    init(directory: URL, http: HTTPClient, hitomi: Bool = false) {
        self.directory = directory.appendingPathComponent("cache")
        self.http = http
        originals = ImageTransferGate(limit: hitomi ? 4 : 12, speculativeLimit: hitomi ? 2 : 4)
        // Thumbnails can load eight alone, but that traffic makes originals return 503.
        // Hitomi therefore shares one budget across thumbnails AND original hosts.
        thumbnails = hitomi ? originals : ImageTransferGate(limit: 12, speculativeLimit: 4)
    }

    // File names are hashes of their keys, asked for every thumbnail shown: each computed once.
    static func name(_ key: String) -> String {
        if let known = names.value(key) { return known }
        let digits = Array("0123456789abcdef".utf8)
        var hex = [UInt8](); hex.reserveCapacity(64)
        for byte in SHA256.hash(data: Data(key.utf8)) { hex.append(digits[Int(byte >> 4)]); hex.append(digits[Int(byte & 15)]) }
        let name = String(decoding: hex, as: UTF8.self)
        names.set(key, name)
        return name
    }

    private static let names = NameMemo()

    // The image's file when it is already on the phone (a relaunch decodes it for the first frame).
    nonisolated func localFile(_ key: String) -> URL? {
        let file = directory.appendingPathComponent(Self.name(key))
        guard FileManager.default.fileExists(atPath: file.appendingPathExtension("mime").path), (DurableFile.size(file) ?? 0) > 0 else { return nil }
        return file
    }

    // Visible and speculative callers share the same transfer. Promotion changes the
    // admission queue, never restarts bytes already arriving. Cancelling a prefetch worker
    // drops its ownership too, so old galleries cannot occupy the reader's slots.
    func file(_ key: String, source: @escaping @Sendable (_ stale: Bool) async throws -> (url: URL, referer: String)) async throws -> URL {
        try await load(key, priority: URLSessionTask.highPriority, speculative: false, source: source)
    }

    private func load(_ key: String, priority: Float, speculative: Bool,
                      source: @escaping @Sendable (Bool) async throws -> (url: URL, referer: String)) async throws -> URL {
        let file = directory.appendingPathComponent(Self.name(key))
        if let saved = localFile(key) { touch(saved); return saved }
        try Task.checkCancellation()
        let gate = key.contains(":image:") ? originals : thumbnails
        if loading[key] == nil {
            let id = UUID()
            let task = Task { [http] in
                defer { if loading[key]?.id == id { loading[key] = nil } }
                do {
                    let result = try await Self.fetch(file, http: http, gate: gate, id: id,
                                                      priority: priority, speculative: speculative, source: source)
                    await gate.forget(id)
                    return result
                } catch { await gate.forget(id); throw error }
            }
            loading[key] = Transfer(id: id, task: task)
        }
        let caller = UUID()
        loading[key]!.callers.insert(caller)
        let transfer = loading[key]!
        return try await withTaskCancellationHandler {
            await gate.promote(transfer.id, priority: priority, interactive: !speculative)
            do {
                try Task.checkCancellation()
                let result = try await transfer.task.value
                await gate.forget(transfer.id)
                try Task.checkCancellation()
                return result
            } catch {
                // The transfer may have finished before this caller's promotion arrived.
                if loading[key]?.id != transfer.id { await gate.forget(transfer.id) }
                throw error
            }
        } onCancel: { Task { await self.abandon(key, transfer: transfer.id, caller: caller) } }
    }

    private func abandon(_ key: String, transfer: UUID, caller: UUID) {
        guard loading[key]?.id == transfer else { return }
        loading[key]!.callers.remove(caller)
        guard loading[key]!.callers.isEmpty else { return }
        loading[key]!.task.cancel()
        loading[key] = nil
    }

    private static func fetch(_ file: URL, http: HTTPClient, gate: ImageTransferGate, id: UUID,
                              priority: Float, speculative: Bool,
                              source: @Sendable (_ stale: Bool) async throws -> (url: URL, referer: String)) async throws -> URL {
        var lastError: Error?
        for attempt in 0..<3 {
            try Task.checkCancellation()
            try await gate.acquire(id, priority: priority, speculative: speculative)
            do {
                // Resolve after admission: a queued request must use the current routing table.
                let (url, referer) = try await source(attempt > 0)
                let response = try await http.download(HTTPRequest(url, referer: referer, retry: .never, priority: priority),
                                                       to: file) { response in
                    guard response.statusCode == 200, response.mimeType?.hasPrefix("image/") == true else { throw URLError(.badServerResponse) }
                }
                try DurableFile.write(Data((response.mimeType ?? "image/jpeg").utf8), to: file.appendingPathExtension("mime"))
                await gate.release(id)
                return file
            } catch {
                await gate.release(id, error: error)
                try Task.checkCancellation()
                lastError = error
                if let status = error as? HTTPStatusError, [403, 404, 429, 503].contains(status.status) { continue }
                throw error
            }
        }
        throw lastError ?? URLError(.badServerResponse)
    }

    func prefetch(_ key: String, priority: Float = URLSessionTask.lowPriority,
                  source: @escaping @Sendable (_ stale: Bool) async throws -> (url: URL, referer: String)) async {
        _ = try? await load(key, priority: priority, speculative: true, source: source)
    }

    var debugState: [String: [String: Int]] {
        get async {
            if originals === thumbnails { return ["shared": await originals.state] }
            return ["originals": await originals.state, "thumbnails": await thumbnails.state]
        }
    }

    private nonisolated func touch(_ file: URL) {
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
    }

    // Keeps the cache under `limit` bytes, deleting the least recently used images.
    func trim(limit: Int64) {
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey]
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: keys) else { return }
        var images: [(url: URL, size: Int64, date: Date)] = []
        var total: Int64 = 0
        for file in files where file.pathExtension != "mime" {
            let values = try? file.resourceValues(forKeys: Set(keys))
            let size = Int64(values?.fileSize ?? 0)
            total += size
            images.append((file, size, values?.contentModificationDate ?? .distantPast))
        }
        guard total > limit else { return }
        for image in images.sorted(by: { $0.date < $1.date }) {
            try? FileManager.default.removeItem(at: image.url)
            try? FileManager.default.removeItem(at: image.url.appendingPathExtension("mime"))
            total -= image.size
            if total <= limit * 3 / 4 { break }
        }
        Log.images.info("Image cache trimmed to \(total) bytes")
    }
}

// A search's results as the phone keeps them (search-cache/<sha256(provider:query)>.json).
struct CachedSearch: Codable, Sendable, Equatable {
    var query: String
    var ids: [Int]
    var total: Int
    var complete: Bool
    // Imhentai: how many pages of 20 were read.
    var pages: Int
    var savedAt: Date
}

actor SearchCache {
    private let directory: URL
    private let provider: ProviderID

    init(directory: URL, provider: ProviderID) {
        self.directory = directory.appendingPathComponent("search-cache")
        self.provider = provider
    }

    private nonisolated func file(_ query: String) -> URL { directory.appendingPathComponent(ImageCache.name(provider.rawValue + ":" + query) + ".json") }

    func load(_ query: String) -> CachedSearch? { loadNow(query) }

    // The same on the calling thread (a relaunch lists the kept results in its first frame).
    nonisolated func loadNow(_ query: String) -> CachedSearch? { try? DurableFile.readJSON(CachedSearch.self, from: file(query)) }

    func save(_ search: CachedSearch) {
        do { try DurableFile.writeJSON(search, to: file(search.query)) }
        catch { Log.store.error("Search not cached: \(error.localizedDescription, privacy: .public)") }
    }

    // A fresh first answer merged into what was kept: Hitomi answers with every result, which
    // replaces the list; Imhentai's first page puts its new galleries in front of the kept
    // ones (or replaces them when nothing overlaps: the results moved on).
    static func merge(_ cached: CachedSearch?, fresh: SearchPage, query: String, paged: Bool) -> CachedSearch {
        guard paged, let cached else {
            return CachedSearch(query: query, ids: fresh.ids, total: fresh.total, complete: fresh.complete, pages: 1, savedAt: Date())
        }
        let kept = Set(cached.ids)
        guard fresh.ids.contains(where: kept.contains) else {
            return CachedSearch(query: query, ids: fresh.ids, total: fresh.total, complete: fresh.complete, pages: 1, savedAt: Date())
        }
        let new = fresh.ids.prefix { !kept.contains($0) }
        var seen = Set<Int>()
        let ids = (Array(new) + cached.ids).filter { seen.insert($0).inserted }
        return CachedSearch(query: query, ids: ids, total: max(fresh.total, ids.count), complete: cached.complete, pages: cached.pages, savedAt: Date())
    }

    // The next page of a paged search, appended without repeats.
    static func append(_ cached: CachedSearch, page: SearchPage) -> CachedSearch {
        var next = cached
        var seen = Set(cached.ids)
        next.ids += page.ids.filter { seen.insert($0).inserted }
        next.pages += 1
        next.total = max(page.total, next.ids.count)
        next.complete = page.complete || page.ids.isEmpty
        next.savedAt = Date()
        return next
    }
}
