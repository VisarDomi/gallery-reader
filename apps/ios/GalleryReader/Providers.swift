import Foundation
import KitCore
import KitNet

enum ProviderID: String, Codable, Sendable { case hitomi, imhentai }

// A gallery as both providers describe it. `thumbnail` is the page's thumbnail URL; `image`
// what the provider needs for the original (Hitomi: the file hash; Imhentai: its URL).
struct GalleryInfo: Codable, Sendable, Equatable {
    struct Tag: Codable, Sendable, Hashable { var tag: String; var female = false; var male = false }
    struct Page: Codable, Sendable, Equatable { var thumbnail: String; var image: String; var width: Double; var height: Double }
    var id: Int
    var title = ""
    var titleJpn = ""
    var type = ""
    var language = ""
    var date = ""
    var artists: [String] = []
    var groups: [String] = []
    var parody: [String] = []
    var characters: [String] = []
    var tags: [Tag] = []
    var pages: [Page] = []
}

// One answer to a search: Hitomi answers with every result at once (`complete`); Imhentai
// one page of 20 at a time, with the number of pages.
struct SearchPage: Sendable, Equatable {
    var ids: [Int]
    var total: Int
    var complete: Bool
}

struct Suggestion: Sendable, Equatable { var name: String; var count: Int; var namespace: String }

enum ProviderError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}

protocol GalleryProvider: Sendable {
    var id: ProviderID { get }
    var origin: URL { get }
    var name: String { get }
    func search(_ query: String, page: Int) async throws -> SearchPage
    func gallery(_ id: Int) async throws -> GalleryInfo
    // The original's URL and the Referer it needs; `stale` after a failed load (Hitomi's
    // image hosts change).
    func image(_ page: GalleryInfo.Page, of gallery: Int, stale: Bool) async throws -> (url: URL, referer: String)
    func suggestions(_ text: String) async throws -> [Suggestion]
    // The search for one value of the info sheet (in the gallery's language).
    func tagQuery(namespace: String, value: String, language: String) -> String
    var supportsSuggestions: Bool { get }
}

// MARK: - Hitomi

// Hitomi's own data (no site JavaScript runs): search through its binary Nozomi indexes
// (positive terms intersected, negative ones removed, ordered as the last positive term),
// galleries from galleries/<id>.js, image hosts from gg.js, suggestions from tagindex.
struct Hitomi: GalleryProvider {
    static let domain = "gold-usergeneratedcontent.net"
    let id = ProviderID.hitomi
    let origin = URL(string: "https://hitomi.la")!
    let name = "Hitomi"
    let supportsSuggestions = true
    let http: HTTPClient
    let gg = GGCache()

    func search(_ query: String, page: Int) async throws -> SearchPage {
        let (positive, negative) = Self.parse(query)
        // Only exclusions: they narrow the Japanese galleries.
        let ids = try await intersect(positive: positive.isEmpty ? ["language:japanese"] : positive, negative: negative)
        return SearchPage(ids: ids, total: ids.count, complete: true)
    }

    static func parse(_ query: String) -> (positive: [String], negative: [String]) {
        var positive: [String] = [], negative: [String] = []
        for term in query.split(whereSeparator: \.isWhitespace).map(String.init) {
            if term.hasPrefix("-") { if term.count > 1 { negative.append(String(term.dropFirst())) } }
            else { positive.append(term) }
        }
        return (positive, negative)
    }

    static func nozomiURL(_ term: String) -> URL? {
        let parts = term.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        let namespace = parts[0], tag = parts.count > 1 ? parts[1] : ""
        var path: String, language = "all"
        if namespace == "female" || namespace == "male" { path = "tag/" + term.replacingOccurrences(of: "_", with: " ") }
        else if namespace == "language" { language = tag; path = "index" }
        else if !tag.isEmpty { path = namespace + "/" + tag.replacingOccurrences(of: "_", with: " ") }
        else { path = "tag/" + namespace.replacingOccurrences(of: "_", with: " ") }
        let raw = "/n/\(path)-\(language).nozomi"
        guard let encoded = raw.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return nil }
        return URL(string: "https://ltn.\(domain)\(encoded)")
    }

    static func decodeNozomi(_ data: Data) throws -> [Int] {
        guard data.count % 4 == 0 else { throw ProviderError.invalid("Invalid Nozomi response length: \(data.count)") }
        return stride(from: 0, to: data.count, by: 4).map { offset in
            data[data.startIndex + offset..<data.startIndex + offset + 4].reduce(0) { $0 << 8 | Int($1) }
        }
    }

    private func nozomi(_ term: String) async throws -> [Int] {
        guard let url = Self.nozomiURL(term) else { throw ProviderError.invalid("Invalid search term: \(term)") }
        return try Self.decodeNozomi(try await http.send(HTTPRequest(url, referer: origin.absoluteString + "/")).data)
    }

    private func intersect(positive: [String], negative: [String]) async throws -> [Int] {
        let included = Array(NSOrderedSet(array: positive)) as? [String] ?? positive
        guard !included.isEmpty else { return [] }
        let excluded = Array(NSOrderedSet(array: negative)) as? [String] ?? negative
        // Six requests at a time; the order is the last positive term's.
        let lists = try await Self.fetchAll(included + excluded, limit: 6) { try await nozomi($0) }
        var allowed = Set(lists[0])
        for list in lists[1..<included.count] { allowed.formIntersection(list) }
        for list in lists[included.count...] { allowed.subtract(list) }
        var seen = Set<Int>()
        return lists[included.count - 1].filter { allowed.contains($0) && seen.insert($0).inserted }
    }

    static func fetchAll<T: Sendable>(_ items: [String], limit: Int, _ load: @escaping @Sendable (String) async throws -> T) async throws -> [T] {
        var results = [T?](repeating: nil, count: items.count)
        try await withThrowingTaskGroup(of: (Int, T).self) { group in
            var next = 0
            func add() { let index = next; next += 1; group.addTask { (index, try await load(items[index])) } }
            for _ in 0..<min(limit, items.count) { add() }
            while let (index, value) = try await group.next() {
                results[index] = value
                if next < items.count { add() }
            }
        }
        return results.map { $0! }
    }

    func gallery(_ id: Int) async throws -> GalleryInfo {
        let url = URL(string: "https://ltn.\(Self.domain)/galleries/\(id).js")!
        let text = try await http.send(HTTPRequest(url, referer: "https://hitomi.la/reader/\(id).html")).text
        return try Self.parseGallery(text, id: id)
    }

    // "var galleryinfo = {…}": the JSON after the first "=" (a title may contain "=").
    static func parseGallery(_ text: String, id: Int) throws -> GalleryInfo {
        guard let equals = text.firstIndex(of: "=") else { throw ProviderError.invalid("Gallery \(id) has no data") }
        var json = text[text.index(after: equals)...].trimmingCharacters(in: .whitespacesAndNewlines)
        if json.hasSuffix(";") { json.removeLast() }
        guard let raw = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else { throw ProviderError.invalid("Gallery \(id) is not JSON") }
        func strings(_ key: String, _ field: String) -> [String] { (raw[key] as? [[String: Any]] ?? []).compactMap { $0[field] as? String } }
        func flag(_ value: Any?) -> Bool { (value as? String) == "1" || (value as? Bool) == true || (value as? Int) == 1 }
        let files = raw["files"] as? [[String: Any]] ?? []
        return GalleryInfo(
            id: id, title: raw["title"] as? String ?? "", titleJpn: raw["japanese_title"] as? String ?? "",
            type: raw["type"] as? String ?? "", language: raw["language"] as? String ?? "", date: raw["date"] as? String ?? "",
            artists: strings("artists", "artist"), groups: strings("groups", "group"), parody: strings("parodys", "parody"),
            characters: strings("characters", "character"),
            tags: (raw["tags"] as? [[String: Any]] ?? []).compactMap { tag in
                (tag["tag"] as? String).map { GalleryInfo.Tag(tag: $0, female: flag(tag["female"]), male: flag(tag["male"])) }
            },
            pages: files.compactMap { file in
                guard let hash = file["hash"] as? String, hash.count >= 3 else { return nil }
                return GalleryInfo.Page(thumbnail: thumbnailURL(hash), image: hash,
                                        width: (file["width"] as? NSNumber)?.doubleValue ?? 0, height: (file["height"] as? NSNumber)?.doubleValue ?? 0)
            })
    }

    static func thumbnailURL(_ hash: String) -> String {
        let last = hash.suffix(1), pair = hash.dropLast().suffix(2)
        return "https://tn.\(domain)/webpsmalltn/\(last)/\(pair)/\(hash).webp"
    }

    func image(_ page: GalleryInfo.Page, of gallery: Int, stale: Bool) async throws -> (url: URL, referer: String) {
        let table = try await gg.table(http: http, refresh: stale)
        return (try table.url(hash: page.image), "https://hitomi.la/reader/\(gallery).html")
    }

    func suggestions(_ text: String) async throws -> [Suggestion] {
        let query = text.lowercased().replacingOccurrences(of: "_", with: " ")
        let field: String, term: String
        if let colon = query.firstIndex(of: ":") { field = String(query[..<colon]); term = String(query[query.index(after: colon)...]) }
        else { field = "global"; term = query }
        guard !term.isEmpty, field.range(of: "^[a-z]+$", options: .regularExpression) != nil else { return [] }
        let characters = term.map { character -> String in
            let name = character == " " ? "_" : character == "/" ? "slash" : character == "." ? "dot" : String(character)
            return name.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_.!~*'()"))) ?? name
        }
        let url = URL(string: "https://tagindex.hitomi.la/\(field)/\(characters.joined(separator: "/")).json")!
        let response = try await http.send(HTTPRequest(url, referer: origin.absoluteString + "/", retry: .never, accept: [404]))
        if response.status == 404 { return [] }
        return try Self.parseSuggestions(response.data)
    }

    static func parseSuggestions(_ data: Data) throws -> [Suggestion] {
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[Any]] else { throw ProviderError.invalid("Invalid Hitomi suggestions") }
        return rows.prefix(100).compactMap { row in
            guard row.count >= 3, let name = row[0] as? String, let count = (row[1] as? NSNumber)?.intValue, let namespace = row[2] as? String else { return nil }
            return Suggestion(name: name, count: count, namespace: namespace)
        }
    }

    func tagQuery(namespace: String, value: String, language: String) -> String {
        let prefix = !language.isEmpty && namespace != "language" ? "language:\(language) " : ""
        return prefix + namespace + ":" + value.replacingOccurrences(of: " ", with: "_")
    }
}

// gg.js: which of Hitomi's image hosts serves each file, and the current base path. Read once
// and again after a failed image (the path changes over time; never stored on disk).
actor GGCache {
    struct Table: Sendable {
        var hosts: [Int: Int]
        var defaultOffset: Int
        var basePath: String

        func url(hash: String) throws -> URL {
            guard hash.count >= 3, let index = Int(String(hash.suffix(1)) + String(hash.dropLast().suffix(2)), radix: 16) else {
                throw ProviderError.invalid("Invalid image hash")
            }
            let offset = (hosts[index] ?? defaultOffset) + 1
            guard let url = URL(string: "https://w\(offset).\(Hitomi.domain)/\(basePath)/\(index)/\(hash).webp") else { throw ProviderError.invalid("Invalid image URL") }
            return url
        }
    }

    private var current: Table?
    private var loading: Task<Table, Error>?
    private var loadedAt = Date.distantPast

    func table(http: HTTPClient, refresh: Bool) async throws -> Table {
        if refresh, Date().timeIntervalSince(loadedAt) > 5 { current = nil }
        if let current { return current }
        if let loading { return try await loading.value }
        let task = Task {
            try Self.parse(try await http.send(HTTPRequest(URL(string: "https://ltn.\(Hitomi.domain)/gg.js")!, referer: "https://hitomi.la/")).text)
        }
        loading = task
        defer { loading = nil }
        let table = try await task.value
        current = table
        loadedAt = Date()
        return table
    }

    static func parse(_ text: String) throws -> Table {
        var hosts: [Int: Int] = [:]
        var pending: [Int] = []
        let cases = try NSRegularExpression(pattern: #"case\s+(\d+):(?:\s*o\s*=\s*(\d+))?"#)
        let range = NSRange(text.startIndex..., in: text)
        for match in cases.matches(in: text, range: range) {
            if let key = Int(text[Range(match.range(at: 1), in: text)!]) { pending.append(key) }
            if let valueRange = Range(match.range(at: 2), in: text), let value = Int(text[valueRange]) {
                for key in pending { hosts[key] = value }
                pending = []
            }
        }
        let ifs = try NSRegularExpression(pattern: #"if\s+\(g\s*===?\s*(\d+)\)[\s{]*o\s*=\s*(\d+)"#)
        for match in ifs.matches(in: text, range: range) {
            if let key = Int(text[Range(match.range(at: 1), in: text)!]), let value = Int(text[Range(match.range(at: 2), in: text)!]) { hosts[key] = value }
        }
        let defaultMatch = try NSRegularExpression(pattern: #"(?:var\s|default:)\s*o\s*=\s*(\d+)"#).firstMatch(in: text, range: range)
        let baseMatch = try NSRegularExpression(pattern: #"b:\s*[']([^']+)[']"#).firstMatch(in: text, range: range)
        guard let defaultMatch, let offset = Int(text[Range(defaultMatch.range(at: 1), in: text)!]) else {
            throw ProviderError.invalid("Hitomi gg.js did not contain the default host offset")
        }
        guard let baseMatch, case let base = String(text[Range(baseMatch.range(at: 1), in: text)!]), !base.isEmpty else {
            throw ProviderError.invalid("Hitomi gg.js did not contain the image base path")
        }
        return Table(hosts: hosts, defaultOffset: offset, basePath: base.hasSuffix("/") ? String(base.dropLast()) : base)
    }
}

// MARK: - Imhentai

// Imhentai's HTML: search pages of 20 (a path for one namespace or a language, the search
// endpoint otherwise) and gallery pages (images from the inline JSON of extensions and sizes).
struct Imhentai: GalleryProvider {
    static let domain = "imhentai.xxx"
    static let languages: [(String, String)] = [("japanese", "jp"), ("english", "en"), ("spanish", "es"), ("french", "fr"),
                                                ("korean", "kr"), ("german", "de"), ("russian", "ru")]
    let id = ProviderID.imhentai
    let origin = URL(string: "https://imhentai.xxx")!
    let name = "Imhen"
    let supportsSuggestions = false
    let http: HTTPClient
    static let pageSize = 20

    func search(_ query: String, page: Int) async throws -> SearchPage {
        let html = try await http.send(HTTPRequest(Self.searchURL(query, page: page), referer: origin.absoluteString + "/")).text
        return Self.parseSearch(html, page: page)
    }

    static func parseSearch(_ html: String, page: Int) -> SearchPage {
        var ids: [Int] = []
        var previous = -1
        for href in extractAll(html, start: "href=\"/gallery/", end: "\"") {
            guard let id = Int(href.prefix { $0.isNumber }) else { continue }
            if id != previous { ids.append(id) }
            previous = id
        }
        var seen = Set<Int>()
        ids = ids.filter { seen.insert($0).inserted }
        var pages = page
        for href in extractAll(html, start: "class='page-link' href='", end: "'") {
            if let range = href.range(of: #"[?&]page=(\d+)"#, options: .regularExpression),
               let number = Int(href[range].drop { !$0.isNumber }) { pages = max(pages, number) }
        }
        if pages == page && ids.isEmpty { pages = 0 }
        return SearchPage(ids: ids, total: pages * pageSize, complete: page >= pages)
    }

    static func searchURL(_ query: String, page: Int?) -> URL {
        var language: String?
        var namespaces: [(String, String)] = []
        var keywords: [String] = []
        for term in query.trimmingCharacters(in: .whitespaces).split(separator: ",").map({ $0.trimmingCharacters(in: .whitespaces) }) where !term.isEmpty {
            guard let colon = term.firstIndex(of: ":") else { keywords.append(term); continue }
            let namespace = String(term[..<colon]), value = String(term[term.index(after: colon)...])
            if namespace == "language" { language = value } else { namespaces.append((namespace, value)) }
        }
        func dashed(_ value: String) -> String {
            value.split(whereSeparator: \.isWhitespace).joined(separator: "-").addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-_.!~*'()"))) ?? value
        }
        let suffix = page.map { "?page=\($0)" } ?? ""
        if language == nil && keywords.isEmpty && namespaces.count == 1 {
            return URL(string: "https://\(domain)/\(namespaces[0].0)/\(dashed(namespaces[0].1))/\(suffix)")!
        }
        if let language, namespaces.isEmpty, keywords.isEmpty {
            return URL(string: "https://\(domain)/language/\(dashed(language))/\(suffix)")!
        }
        if language != nil && namespaces.count == 1 && keywords.isEmpty { keywords = [namespaces[0].1] }
        var items = ["lt": "1", "pp": "0", "m": "1", "d": "1", "w": "1", "i": "1", "a": "1", "g": "1", "apply": "Search", "dl": "0", "tr": "0"]
            .map { URLQueryItem(name: $0.key, value: $0.value) }
        let chosen = language.flatMap { name in languages.first { $0.0 == name }?.1 ?? "jp" }
        for (_, code) in languages { items.append(URLQueryItem(name: code, value: chosen == nil || chosen == code ? "1" : "0")) }
        items.append(URLQueryItem(name: "key", value: keywords.map { $0.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ") }.joined(separator: ",")))
        if let page { items.append(URLQueryItem(name: "page", value: String(page))) }
        var components = URLComponents(string: "https://\(domain)/search/")!
        components.queryItems = items.sorted { $0.name < $1.name }
        return components.url!
    }

    func gallery(_ id: Int) async throws -> GalleryInfo {
        let html = try await http.send(HTTPRequest(URL(string: "https://\(Self.domain)/gallery/\(id)/")!, referer: origin.absoluteString + "/")).text
        return Self.parseGallery(html, id: id)
    }

    static func parseGallery(_ html: String, id: Int) -> GalleryInfo {
        var info = meta(html, id: id)
        let first = extractBetween(html, start: "data-src=\"", end: "\"")?.value ?? ""
        let base = first.range(of: "/", options: .backwards).map { String(first[...$0.lowerBound]) } ?? ""
        let extensions = ["j": "jpg", "p": "png", "g": "gif", "w": "webp", "a": "avif"]
        // The page lists the first few thumbnails; their URL gives the thumbnails' extension.
        var thumbnails: [Int: String] = [:]
        let pattern = try! NSRegularExpression(pattern: #"\bdata-src\s*=\s*["']([^"']+)["']"#, options: [.caseInsensitive])
        for match in pattern.matches(in: html, range: NSRange(html.startIndex..., in: html)) {
            let source = String(html[Range(match.range(at: 1), in: html)!])
            if let range = source.range(of: #"/(\d+)t\.(?:jpe?g|png|webp|avif|gif)(?:\?|$)"#, options: [.regularExpression, .caseInsensitive]),
               let page = Int(source[range].dropFirst().prefix { $0.isNumber }),
               let absolute = URL(string: source, relativeTo: URL(string: "https://\(domain)/gallery/\(id)/"))?.absoluteString {
                thumbnails[page] = absolute
            }
        }
        let template = thumbnails.sorted { $0.key < $1.key }.first?.value
        func thumbnail(_ page: Int) -> String {
            thumbnails[page] ?? template?.replacingOccurrences(of: #"/\d+t(?=\.)"#, with: "/\(page)t", options: .regularExpression) ?? ""
        }
        if let json = extractBetween(html, start: "$.parseJSON('", end: "'")?.value,
           let data = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: String] {
            let keys = data.keys.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }
            info.pages = keys.enumerated().map { offset, key in
                let parts = data[key]!.split(separator: ",").map(String.init)
                let ext = extensions[parts.first ?? ""] ?? "jpg"
                return GalleryInfo.Page(thumbnail: thumbnail(offset + 1), image: "\(base)\(offset + 1).\(ext)",
                                        width: parts.count > 1 ? Double(parts[1]) ?? 0 : 0, height: parts.count > 2 ? Double(parts[2]) ?? 0 : 0)
            }
            return info
        }
        let loadPages = extractBetween(html, start: "id=\"load_pages\" value=\"", end: "\"").flatMap { Int($0.value) } ?? 0
        let count = loadPages > 0 ? loadPages : extractAll(html, start: "href=\"/view/\(id)/", end: "\"").count
        info.pages = (0..<count).map { GalleryInfo.Page(thumbnail: thumbnail($0 + 1), image: "\(base)\($0 + 1).jpg", width: 0, height: 0) }
        return info
    }

    static func meta(_ html: String, id: Int) -> GalleryInfo {
        func clean(_ text: String) -> String {
            decodeEntities(text.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let title = extractBetween(html, start: "<h1>", end: "</h1>").map { clean($0.value) } ?? ""
        let titleJpn = extractBetween(html, start: "class=\"subtitle\">", end: "<").map { clean($0.value) } ?? ""
        var chunk = Substring(html)
        if let start = html.range(of: "class=\"galleries_info\""), let end = html.range(of: "</ul>", range: start.upperBound..<html.endIndex) {
            chunk = html[start.lowerBound..<end.lowerBound]
        }
        func values(_ namespace: String) -> [String] {
            var results: [String] = [], from = chunk.startIndex
            while let link = chunk.range(of: "href='/\(namespace)/", range: from..<chunk.endIndex),
                  let close = chunk.range(of: "'", range: link.upperBound..<chunk.endIndex),
                  let tagStart = chunk.range(of: ">", range: close.upperBound..<chunk.endIndex),
                  let tagEnd = chunk.range(of: "</a>", range: tagStart.upperBound..<chunk.endIndex) {
                let tag = clean(String(chunk[tagStart.upperBound..<tagEnd.lowerBound])).replacingOccurrences(of: #"\s+\d+$"#, with: "", options: .regularExpression)
                if !tag.isEmpty { results.append(tag) }
                from = tagEnd.upperBound
            }
            return results
        }
        let category = extractBetween(String(chunk), start: "href='/category/", end: "/'")?.value ?? ""
        let date = extractBetween(html, start: ">Posted: ", end: "</li>").map { clean($0.value) } ?? ""
        return GalleryInfo(id: id, title: title, titleJpn: titleJpn, type: category, language: values("language").first ?? "", date: date,
                           artists: values("artist"), groups: values("group"), parody: values("parody"), characters: values("character"),
                           tags: values("tag").map { GalleryInfo.Tag(tag: $0) })
    }

    func image(_ page: GalleryInfo.Page, of gallery: Int, stale: Bool) async throws -> (url: URL, referer: String) {
        guard let url = URL(string: page.image) else { throw ProviderError.invalid("Invalid image URL") }
        return (url, "https://\(Self.domain)/view/\(gallery)/1/")
    }

    func suggestions(_ text: String) async throws -> [Suggestion] { [] }

    func tagQuery(namespace: String, value: String, language: String) -> String {
        namespace == "language" ? "language:\(value)" : "language:\(language),\(value)"
    }
}

func extractBetween(_ text: String, start: String, end: String, from: String.Index? = nil) -> (value: String, next: String.Index)? {
    guard let open = text.range(of: start, range: (from ?? text.startIndex)..<text.endIndex),
          let close = text.range(of: end, range: open.upperBound..<text.endIndex) else { return nil }
    return (String(text[open.upperBound..<close.lowerBound]), close.upperBound)
}

func extractAll(_ text: String, start: String, end: String) -> [String] {
    var results: [String] = [], index = text.startIndex
    while let match = extractBetween(text, start: start, end: end, from: index) {
        results.append(match.value)
        index = match.next
    }
    return results
}

func decodeEntities(_ text: String) -> String {
    guard text.contains("&") else { return text }
    var result = text
    for (entity, character) in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&#039;", "'"), ("&apos;", "'")] {
        result = result.replacingOccurrences(of: entity, with: character)
    }
    return result
}
