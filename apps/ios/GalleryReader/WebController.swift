import UIKit
import WebKit
import Network

@MainActor
final class WebController: UIViewController, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
    let store: GalleryStore
    private var webView: WKWebView!
    private var loading: Task<Void, Error>?
    private var activeDocument = ""
    private var restoreOnLaunch = true
    private var resumeReader: String?


    init() {
        let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support/GalleryReader")
        let base = URL(string: Bundle.main.object(forInfoDictionaryKey: "GalleryServerURL") as? String ?? "https://192.168.1.197:7777")!
        let provider = Bundle.main.object(forInfoDictionaryKey: "ReaderProvider") as? String ?? "hitomi"
        let origin = provider == "hitomi" ? "https://hitomi.la" : "https://imhentai.xxx"
        store = GalleryStore(root: root, api: GalleryAPI(origin: origin, pc: base, certificateURL: Bundle.main.url(forResource: "LocalCA", withExtension: "cer")))
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(LocalFiles(store: store), forURLScheme: "gallery")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "gallery")
        config.ignoresViewportScaleLimits = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        view.backgroundColor = .black
        view.addSubview(webView)
        webView.load(URLRequest(url: URL(string: "gallery://app/")!))
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); webView.frame = view.bounds }
    private func ensureLoaded() async throws {
        if loading == nil { loading = Task { [store] in try await store.load() } }
        try await loading?.value
    }
    func capturePosition() {
        webView?.evaluateJavaScript("window.galleryViewState?.save()", completionHandler: nil)
    }
    func pause() { capturePosition() }
    func resume() {}
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "gallery",
              message.frameInfo.request.url?.host == "app",
              let body = message.body as? [String: Any], let command = body["command"] as? String else {
            replyHandler(nil, "Invalid native request"); return
        }
        let args = body["args"] as? [String: Any] ?? [:]
        let document = args["document"] as? String ?? ""
        let requestPath = (message.frameInfo.request.url?.path ?? "/") + (message.frameInfo.request.url?.query.map { "?" + $0 } ?? "")
        let input = try? JSONSerialization.data(withJSONObject: args)
        Task {
            do {
                try await ensureLoaded()
                switch command {
                case "init":
                    activeDocument = document
                    var payload: [String: Any] = [:]
                    let state = await store.viewState()
                    if let route = ViewPosition.route(requestPath), let position = state.positions[route] {
                        payload["position"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(position))
                    }
                    if restoreOnLaunch {
                        restoreOnLaunch = false
                        if ViewPosition.route(state.lastPath)?.hasPrefix("reader:") == true {
                            if ViewPosition.route(requestPath) == ViewPosition.route(state.libraryPath) {
                                payload["resumeReader"] = state.lastPath
                            } else {
                                payload["redirect"] = state.libraryPath
                                resumeReader = state.lastPath
                            }
                        } else if ViewPosition.route(requestPath) != ViewPosition.route(state.lastPath) {
                            payload["redirect"] = state.lastPath
                        }
                    } else if let resumeReader {
                        payload["resumeReader"] = resumeReader
                        self.resumeReader = nil
                    }
                    replyHandler(String(decoding: try JSONSerialization.data(withJSONObject: payload), as: UTF8.self), nil)
                case "view-save":
                    guard document == activeDocument else { replyHandler("{}", nil); return }
                    let data = try JSONSerialization.data(withJSONObject: args["position"] as? [String: Any] ?? [:])
                    try await store.saveViewPosition(data)
                    replyHandler("{}", nil)
                case "manifest-read", "manifest-write":
                    guard let input else { throw ReaderError.invalidRequest }
                    replyHandler(try await store.manifest(input, write: command == "manifest-write"), nil)
                case "fetch":
                    guard let input else { throw ReaderError.invalidRequest }
                    replyHandler(try await store.fetch(input), nil)
                default: replyHandler(nil, "Unknown native request")
                }
            } catch { replyHandler(nil, error.localizedDescription) }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        decisionHandler(url?.scheme == "gallery" && url?.host == "app" ? .allow : .cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}

// WebKit decodes/renders images in its web content process. The storage actor
// reads files; the main actor only delivers completed responses.
@MainActor
final class LocalFiles: NSObject, WKURLSchemeHandler {
    let store: GalleryStore
    private var tasks: [ObjectIdentifier: Task<Void, Never>] = [:]
    init(store: GalleryStore) { self.store = store }
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let id = ObjectIdentifier(urlSchemeTask)
        guard let url = urlSchemeTask.request.url else { return }
        tasks[id] = Task { [store, weak self] in
            do {
                let result = try await store.localResource(url)
                guard !Task.isCancelled else { return }
                let response = URLResponse(url: url, mimeType: result.mime, expectedContentLength: result.data.count, textEncodingName: result.mime.hasPrefix("text/") ? "utf-8" : nil)
                urlSchemeTask.didReceive(response)
                urlSchemeTask.didReceive(result.data)
                urlSchemeTask.didFinish()
            } catch {
                if !Task.isCancelled { urlSchemeTask.didFailWithError(error) }
            }
            self?.tasks.removeValue(forKey: id)
        }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        tasks.removeValue(forKey: ObjectIdentifier(urlSchemeTask))?.cancel()
    }
}
