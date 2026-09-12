import Foundation

struct ViewPosition: Codable, Sendable {
    let path: String
    let anchor: String?
    let page: Int?
    let fraction: Double
    let y: Double
    let strips: [String: Double]

    static func route(_ path: String) -> String? {
        guard let url = URLComponents(string: path), url.scheme == nil, url.host == nil,
              url.path == "/", url.fragment == nil else { return nil }
        let query = url.queryItems ?? []
        guard Set(query.map(\.name)).count == query.count else { return nil }
        let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
        if let key = values["read"] {
            guard key.range(of: "^(hitomi|imhentai)-[1-9][0-9]*$", options: .regularExpression) != nil,
                  Set(values.keys).isSubset(of: ["read", "page"]),
                  let page = Int(values["page"] ?? "1"), (1...1_000_000).contains(page) else { return nil }
            return "reader:" + key
        }
        guard Set(values.keys).isSubset(of: ["p", "q"]), let page = Int(values["p"] ?? "1"),
              (1...1_000_000).contains(page) else { return nil }
        return "library:\(values["q"].map { "search:" + $0 } ?? "favorites"):\(page)"
    }
    func validate() throws {
        guard Self.route(path) != nil, fraction.isFinite, (0...1).contains(fraction),
              y.isFinite, (0...1_000_000_000).contains(y), strips.count <= 560,
              strips.allSatisfy({ $0.key.count < 100 && $0.value.isFinite && (0...1_000_000_000).contains($0.value) }),
              page == nil || (0..<1_000_000).contains(page!), (anchor?.count ?? 0) < 100
        else { throw ReaderError.invalidRequest }
    }
}

struct ViewState: Codable, Sendable {
    var version = 1
    var lastPath = "/"
    var libraryPath = "/"
    var positions: [String: ViewPosition] = [:]
}

enum ReaderError: LocalizedError {
    case invalidRequest, badResponse(Int)
    var errorDescription: String? {
        switch self { case .invalidRequest: return "Invalid reader request"; case .badResponse(let code): return "Image request failed (HTTP \(code))" }
    }
}
