import Foundation
import KitCore
import KitLists
import KitReader

extension Notification.Name {
    static let favoritesChanged = Notification.Name("GalleryReader.favoritesChanged")
    static let searchesChanged = Notification.Name("GalleryReader.searchesChanged")
}

struct SavedSearch: Codable, Equatable, Sendable {
    var query: String
    var page: Int?
}

// What the reader keeps: favorites (newest first), saved searches (most recent first) and
// places. `favorites`, `searches`, `page` and `scroll` are the web version's IndexedDB record,
// kept so PC backups stay readable by both; `anchors` (a list's row at the middle) and
// `readers` (a gallery's page and how far down it) are the native places.
struct ReaderData: Codable, Sendable, Equatable {
    var favorites: [Int] = []
    var searches: [SavedSearch] = []
    var page = 1
    var scroll: [String: Double] = [:]
    var anchors: [String: ScrollAnchor] = [:]
    var readers: [String: StripPosition] = [:]
    var readerOrder: [String] = []

    enum CodingKeys: String, CodingKey { case favorites, searches, page, scroll, anchors, readers, readerOrder }
    init() {}
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        favorites = try container.decodeIfPresent([Int].self, forKey: .favorites) ?? []
        searches = try container.decodeIfPresent([SavedSearch].self, forKey: .searches) ?? []
        page = try container.decodeIfPresent(Int.self, forKey: .page) ?? 1
        scroll = try container.decodeIfPresent([String: Double].self, forKey: .scroll) ?? [:]
        anchors = try container.decodeIfPresent([String: ScrollAnchor].self, forKey: .anchors) ?? [:]
        readers = try container.decodeIfPresent([String: StripPosition].self, forKey: .readers) ?? [:]
        readerOrder = try container.decodeIfPresent([String].self, forKey: .readerOrder) ?? []
    }
}

enum StateError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}

// The state, saved durably on every change (off the main thread, newest first): a kill or a
// power-off loses nothing.
@MainActor
final class ReaderState {
    private(set) var data: ReaderData
    private let writer: BackgroundWriter
    private static let keepReaders = 500

    init(directory: URL) {
        writer = BackgroundWriter(url: directory.appendingPathComponent("state.json"), label: "reader-state")
        data = (try? DurableFile.readJSON(ReaderData.self, from: writer.url)) ?? ReaderData()
    }

    var exists: Bool { FileManager.default.fileExists(atPath: writer.url.path) }

    func flush() { writer.flush() }

    private func save(_ notification: Notification.Name? = nil) {
        writer.save(json: data)
        if let notification { NotificationCenter.default.post(name: notification, object: self) }
    }

    // MARK: favorites

    func isFavorite(_ id: Int) -> Bool { data.favorites.contains(id) }

    // Adds (to the front) or removes; true when it is now a favorite.
    @discardableResult
    func toggleFavorite(_ id: Int) -> Bool {
        if let index = data.favorites.firstIndex(of: id) { data.favorites.remove(at: index); save(.favoritesChanged); return false }
        data.favorites.insert(id, at: 0)
        save(.favoritesChanged)
        return true
    }

    // Every number in the text, new ones prepended in the pasted order.
    func importFavorites(_ text: String) -> (added: Int, total: Int) {
        let ids = text.split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }.filter { $0 > 0 }
        var existing = Set(data.favorites)
        let added = ids.filter { existing.insert($0).inserted }
        if !added.isEmpty {
            data.favorites.insert(contentsOf: added, at: 0)
            save(.favoritesChanged)
        }
        return (added.count, ids.count)
    }

    var exportText: String { data.favorites.map(String.init).joined(separator: " ") }

    // MARK: searches

    func saveSearch(_ query: String) {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty, data.searches.first?.query != query else { return }
        let page = data.searches.first { $0.query == query }?.page
        data.searches = [SavedSearch(query: query, page: page)] + data.searches.filter { $0.query != query }
        save(.searchesChanged)
    }

    func removeSearch(_ query: String) {
        data.searches.removeAll { $0.query == query }
        data.anchors["search:" + query] = nil
        save(.searchesChanged)
    }

    // MARK: places

    func anchor(_ key: String) -> ScrollAnchor? { data.anchors[key] }

    func setAnchor(_ anchor: ScrollAnchor?, for key: String) {
        guard data.anchors[key] != anchor else { return }
        data.anchors[key] = anchor
        save()
    }

    func readerPosition(_ gallery: Int) -> StripPosition? { data.readers[String(gallery)] }

    func setReaderPosition(_ position: StripPosition, for gallery: Int) {
        let key = String(gallery)
        guard data.readers[key] != position else { return }
        data.readers[key] = position
        data.readerOrder.removeAll { $0 == key }
        data.readerOrder.append(key)
        while data.readerOrder.count > Self.keepReaders { data.readers[data.readerOrder.removeFirst()] = nil }
        save()
    }

    // MARK: backups and migration (the web version's record)

    // {version: 1, indexedDB: {favorites, searches, page, scroll}}
    func backupData() -> [String: Any] {
        ["version": 1, "indexedDB": ["favorites": data.favorites,
                                     "searches": data.searches.map { search -> [String: Any] in
                                         var value: [String: Any] = ["query": search.query]
                                         if let page = search.page { value["page"] = page }
                                         return value
                                     },
                                     "page": data.page, "scroll": data.scroll]]
    }

    static func validate(_ value: Any?) throws -> ReaderData {
        guard let state = value as? [String: Any] else { throw StateError.invalid("Invalid reader data") }
        guard let favorites = state["favorites"] as? [Any], favorites.allSatisfy({ (($0 as? NSNumber)?.intValue ?? 0) > 0 }) else { throw StateError.invalid("Invalid favorites") }
        guard let searches = state["searches"] as? [[String: Any]], searches.allSatisfy({ $0["query"] is String }) else { throw StateError.invalid("Invalid saved searches") }
        var data = ReaderData()
        data.favorites = favorites.compactMap { ($0 as? NSNumber)?.intValue }
        data.searches = searches.map { SavedSearch(query: $0["query"] as! String, page: ($0["page"] as? NSNumber)?.intValue) }
        data.page = (state["page"] as? NSNumber)?.intValue ?? 1
        data.scroll = (state["scroll"] as? [String: Any] ?? [:]).compactMapValues { ($0 as? NSNumber)?.doubleValue }
        return data
    }

    static func validateBackup(_ value: Any?) throws -> ReaderData {
        guard let backup = value as? [String: Any], (backup["version"] as? NSNumber)?.intValue == 1 else { throw StateError.invalid("Unsupported gallery backup") }
        return try validate(backup["indexedDB"])
    }

    static func describe(_ data: ReaderData) -> String {
        "\(data.favorites.count) favorites, \(data.searches.count) saved searches, \(data.scroll.count) scroll positions"
    }

    var stats: String { Self.describe(data) }

    // A restore or the one-time move from WebKit: the record replaces favorites, searches and
    // the old places; native places stay where they still apply.
    func replace(with record: ReaderData) {
        data.favorites = record.favorites
        data.searches = record.searches
        data.page = record.page
        data.scroll = record.scroll
        save(.favoritesChanged)
        NotificationCenter.default.post(name: .searchesChanged, object: self)
    }
}
