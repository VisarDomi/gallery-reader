import Foundation
import CryptoKit

// Disk and network work stay off the UI actor. The providers supply URLs and
// dimensions; the cache records actual bytes only after receiving an image.
actor GalleryStore {
    let root: URL
    let api: GalleryAPI
    private var state = ViewState()
    private var loaded = false
    private var images: [String:Task<(Data,String),Error>] = [:]
    init(root: URL, api: GalleryAPI) { self.root = root; self.api = api }
    func load() throws {
        guard !loaded else { return }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: root.appendingPathComponent("view.json")) { state = try JSONDecoder().decode(ViewState.self, from:data) }
        loaded = true
    }
    func viewState() -> ViewState { state }
    func saveViewPosition(_ data: Data) throws {
        let position = try JSONDecoder().decode(ViewPosition.self,from:data)
        try position.validate()
        guard let key = ViewPosition.route(position.path) else { return }
        state.positions[key] = position; state.lastPath = position.path
        if !key.hasPrefix("reader:") { state.libraryPath = position.path }
        try JSONEncoder().encode(state).write(to:root.appendingPathComponent("view.json"),options:.atomic)
    }
    private func cacheURL(_ raw: String) throws -> URL {
        let directory = root.appendingPathComponent("cache")
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        return directory.appendingPathComponent(SHA256.hash(data:Data(raw.utf8)).map { String(format:"%02x",$0) }.joined())
    }
    func fetch(_ input: Data) async throws -> String {
        let (data,response) = try await api.request(input)
        let headers = response.allHeaderFields.reduce(into:[String:String]()) { if let key = $1.key as? String { $0[key] = String(describing:$1.value) } }
        let result = HTTPResult(status:response.statusCode,headers:headers,body:data.base64EncodedString())
        return String(decoding:try JSONEncoder().encode(result),as:UTF8.self)
    }
    func localResource(_ url: URL) async throws -> (data: Data, mime: String) {
        guard url.host == "app" else { throw ReaderError.invalidRequest }
        if url.path == "/image" {
            guard let raw = URLComponents(url:url,resolvingAgainstBaseURL:false)?.queryItems?.first(where:{$0.name == "url"})?.value else { throw ReaderError.invalidRequest }
            let file = try cacheURL(raw), info = file.appendingPathExtension("mime")
            if let data = try? Data(contentsOf:file), let mime = try? String(contentsOf:info,encoding:.utf8) { return (data,mime) }
            let task: Task<(Data,String),Error>
            if let running = images[raw] { task = running }
            else {
                task = Task { [api] in
                    let input = try JSONSerialization.data(withJSONObject:["url":raw])
                    let (data,response) = try await api.request(input,image:true)
                    guard response.statusCode == 200, let mime = response.mimeType, mime.hasPrefix("image/"), !data.isEmpty else { throw ReaderError.badResponse(response.statusCode) }
                    try data.write(to:file,options:.atomic); try mime.write(to:info,atomically:true,encoding:.utf8)
                    return (data,mime)
                }
                images[raw] = task
            }
            defer { images.removeValue(forKey:raw) }
            return try await task.value
        }
        let name = url.path == "/" || url.path.isEmpty ? "index.html" : String(url.path.dropFirst())
        guard ["index.html","app.js","style.css"].contains(name), let file = Bundle.main.url(forResource:name,withExtension:nil,subdirectory:"Web") else { throw ReaderError.invalidRequest }
        return (try Data(contentsOf:file), name.hasSuffix(".js") ? "text/javascript" : name.hasSuffix(".css") ? "text/css" : "text/html")
    }
}
