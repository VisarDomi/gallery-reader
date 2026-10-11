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

// Images on the phone (cache/<sha256(key)> with a .mime file, the web version's format):
// read when saved, otherwise downloaded once (requests for the same image share it). The
// folder is kept under a size limit, least recently used first.
actor ImageCache {
    // One transfer per image, shared by its callers; it stops when every caller gave up (a
    // page scrolled away), so the screen's pages get the connections.
    private struct Transfer {
        let id = UUID()
        let task: Task<URL, Error>
        var callers: Set<UUID> = []
    }

    private let directory: URL
    private let http: HTTPClient
    private var loading: [String: Transfer] = [:]

    init(directory: URL, http: HTTPClient) {
        self.directory = directory.appendingPathComponent("cache")
        self.http = http
    }

    static func name(_ key: String) -> String { SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined() }

    // `source` gives the URL and Referer; it is asked again with `stale` after a failure
    // (Hitomi's image hosts move).
    func file(_ key: String, source: @escaping @Sendable (_ stale: Bool) async throws -> (url: URL, referer: String)) async throws -> URL {
        let file = directory.appendingPathComponent(Self.name(key))
        if FileManager.default.fileExists(atPath: file.appendingPathExtension("mime").path), (DurableFile.size(file) ?? 0) > 0 {
            touch(file)
            return file
        }
        try Task.checkCancellation()
        if loading[key] == nil { loading[key] = Transfer(task: Task { [http] in try await Self.fetch(file, http: http, source: source) }) }
        let caller = UUID()
        loading[key]!.callers.insert(caller)
        let transfer = loading[key]!
        defer { if loading[key]?.id == transfer.id { loading[key] = nil } }
        return try await withTaskCancellationHandler {
            try await transfer.task.value
        } onCancel: {
            Task { await self.abandon(key, transfer: transfer.id, caller: caller) }
        }
    }

    private func abandon(_ key: String, transfer: UUID, caller: UUID) {
        guard loading[key]?.id == transfer else { return }
        loading[key]!.callers.remove(caller)
        guard loading[key]!.callers.isEmpty else { return }
        loading[key]!.task.cancel()
        loading[key] = nil
    }

    private static func fetch(_ file: URL, http: HTTPClient, source: @Sendable (_ stale: Bool) async throws -> (url: URL, referer: String)) async throws -> URL {
        var lastError: Error?
        for attempt in 0..<2 {
            let (url, referer) = try await source(attempt > 0)
            do {
                let response = try await http.download(HTTPRequest(url, referer: referer, priority: URLSessionTask.highPriority), to: file) { response in
                    guard response.statusCode == 200, response.mimeType?.hasPrefix("image/") == true else { throw URLError(.badServerResponse) }
                }
                try DurableFile.write(Data((response.mimeType ?? "image/jpeg").utf8), to: file.appendingPathExtension("mime"))
                return file
            } catch let error as HTTPStatusError where [403, 404].contains(error.status) {
                lastError = error
            }
        }
        throw lastError ?? URLError(.badServerResponse)
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

    private func file(_ query: String) -> URL { directory.appendingPathComponent(ImageCache.name(provider.rawValue + ":" + query) + ".json") }

    func load(_ query: String) -> CachedSearch? { try? DurableFile.readJSON(CachedSearch.self, from: file(query)) }

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
