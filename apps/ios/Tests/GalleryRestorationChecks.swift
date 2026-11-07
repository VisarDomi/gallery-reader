#if targetEnvironment(simulator)
import UIKit
import KitCore
import KitLists
import KitNavigation
import KitTestHooks

@MainActor
final class GalleryRestorationChecks: UIViewController {
    private var app: AppController?
    private var nav: LiveNavigationController?
    private weak var host: UIWindow?
    private var started = false
    private var error = ""
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .black
        TestHooks.shared.register("gallery-viewport-state") { [self] _ in state }
        TestHooks.shared.register("gallery-viewport-action") { [self] query in
            guard let nav else { return state }
            let table = find(UITableView.self, in: nav.topViewController!.view)
            switch query["kind"] {
            case "list-move":
                if let y = query["y"].flatMap(Double.init) { table?.contentOffset.y = CGFloat(y); table?.layoutIfNeeded() }
                if let x = query["x"].flatMap(Double.init), let cell = table?.visibleCells.first,
                   let strip = find(ThumbnailStripView.self, in: cell) { strip.collectionView.contentOffset.x = CGFloat(x) }
            case "open":
                if let list = nav.topViewController as? ListScreen, let row = table?.visibleCells.compactMap({ $0 as? ListRowCell }).first {
                    list.row(row, didSelectPage: 3)
                }
            case "move":
                (nav.topViewController as? ReaderScreen)?.checkViewport(y: query["y"].flatMap(Double.init), scale: query["scale"].flatMap(Double.init), x: query["x"].flatMap(Double.init))
            case "back": _ = nav.popViewController(animated: false)
            case "forward": nav.goForward(animated: false)
            default: break
            }
            return state
        }
        TestHooks.shared.start()
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }; started = true; host = view.window
        do { try prepare() } catch { self.error = String(describing: error) }
    }
    private func find<T: UIView>(_ type: T.Type, in view: UIView) -> T? {
        if let found = view as? T { return found }
        return view.subviews.lazy.compactMap { self.find(type, in: $0) }.first
    }
    private var state: [String: Any] {
        guard let nav else { return ["ready": false, "error": error] }
        let top = nav.topViewController!, table = find(UITableView.self, in: top.view)
        let strips = (table?.visibleCells ?? []).compactMap { cell -> [String: Any]? in
            guard let row = cell as? ListRowCell, let id = row.gallery, let strip = find(ThumbnailStripView.self, in: row) else { return nil }
            return ["key": String(id), "x": strip.collectionView.contentOffset.x]
        }
        return ["ready": nav.view.window != nil, "error": error, "screen": top is ReaderScreen ? "reader" : "list",
                "listY": table?.contentOffset.y ?? 0, "strips": strips,
                "reader": (top as? ReaderScreen)?.checkViewportState ?? [:],
                "saved": top.savedStateJSON, "forward": nav.canGoForward]
    }
    private func prepare() throws {
        let root = URL.documentsDirectory.appendingPathComponent("gallery-viewport-fixture")
        if ProcessInfo.processInfo.arguments.contains("-reset-viewport-check") { try? FileManager.default.removeItem(at: root) }
        let provider = GalleryRestoreProvider()
        if !FileManager.default.fileExists(atPath: root.appendingPathComponent("fixture-ready").path) {
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let jpeg = UIGraphicsImageRenderer(size: CGSize(width: 320, height: 640), format: format).jpegData(withCompressionQuality: 0.9) { context in
                UIColor.systemTeal.setFill(); context.fill(CGRect(x: 0, y: 0, width: 320, height: 640))
                for y in stride(from: 0, to: 640, by: 40) { UIColor.white.setFill(); context.fill(CGRect(x: 0, y: y, width: 320, height: 2)) }
            }
            let state = ReaderState(directory: root)
            for id in 1...12 {
                let info = provider.info(id)
                try DurableFile.writeJSON(info, to: root.appendingPathComponent("galleries/\(id).json"))
                for page in info.pages {
                    for key in [page.thumbnail, "hitomi:image:" + page.image] {
                        let file = root.appendingPathComponent("cache/" + ImageCache.name(key))
                        try DurableFile.write(jpeg, to: file); try DurableFile.write(Data("image/jpeg".utf8), to: file.appendingPathExtension("mime"))
                    }
                }
                _ = state.toggleFavorite(id)
            }
            state.flush(); try DurableFile.write(Data(), to: root.appendingPathComponent("fixture-ready"))
        }
        let app = AppController(checkRoot: root, provider: provider); self.app = app
        let nav = app.makeNavigation(); self.nav = nav; host?.rootViewController = nav; nav.view.layoutIfNeeded()
    }
}

private extension UIViewController {
    var savedStateJSON: Any {
        guard let screen = self as? any LiveScreen, let data = screen.savedState() else { return [:] }
        return (try? JSONSerialization.jsonObject(with: data)) ?? [:]
    }
}
private struct GalleryRestoreProvider: GalleryProvider {
    let id = ProviderID.hitomi
    let origin = URL(string: "https://restore.invalid")!
    let name = "Fixture"
    let supportsSuggestions = false
    func info(_ id: Int) -> GalleryInfo {
        GalleryInfo(id: id, title: "Gallery \(id)", pages: (0..<20).map {
            GalleryInfo.Page(thumbnail: "https://restore.invalid/\(id)/t/\($0).jpg", image: "https://restore.invalid/\(id)/i/\($0).jpg", width: 320, height: 640)
        })
    }
    func gallery(_ id: Int) async throws -> GalleryInfo { info(id) }
    func search(_ query: String, page: Int) async throws -> SearchPage { SearchPage(ids: Array((1...12).reversed()), total: 12, complete: true) }
    func image(_ page: GalleryInfo.Page, of gallery: Int, stale: Bool) async throws -> (url: URL, referer: String) { throw URLError(.notConnectedToInternet) }
    func suggestions(_ text: String) async throws -> [Suggestion] { [] }
    func tagQuery(namespace: String, value: String, language: String) -> String { value }
}
#endif
