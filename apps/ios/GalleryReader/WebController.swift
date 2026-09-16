import UIKit
import WebKit

@MainActor
final class WebController: UIViewController, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
    let store: GalleryStore
    private var webView: WKWebView!
    private let sessionURL: URL
    private var requests: [String: Task<String, Error>] = [:]
    private var restoring = false


    init() {
        let root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support/GalleryReader")
        sessionURL = root.appendingPathComponent("interaction-state")
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
        if let state = try? Data(contentsOf: sessionURL) {
            restoring = true
            webView.interactionState = state
        } else {
            webView.load(URLRequest(url: URL(string: "gallery://app/")!))
        }
    }
    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); webView.frame = view.bounds }
    func saveSession() {
        guard let state = webView?.interactionState as? Data else { return }
        do {
            try FileManager.default.createDirectory(at: sessionURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try state.write(to: sessionURL, options: .atomic)
        } catch { print("WebKit session checkpoint:", error) }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "gallery",
              message.frameInfo.request.url?.host == "app",
              let body = message.body as? [String: Any], let command = body["command"] as? String else {
            replyHandler(nil, "Invalid native request"); return
        }
        let args = body["args"] as? [String: Any] ?? [:]
        let input = try? JSONSerialization.data(withJSONObject: args)
        if command == "fetch-cancel" {
            if let id = args["requestID"] as? String { requests.removeValue(forKey: id)?.cancel() }
            replyHandler("{}", nil); return
        }
        if command == "fetch" {
            guard let input, let id = args["requestID"] as? String else { replyHandler(nil, "Invalid fetch request"); return }
            let task = Task { [store] in try await store.fetch(input) }
            requests[id] = task
            Task {
                defer { requests.removeValue(forKey: id) }
                do { replyHandler(try await task.value, nil) }
                catch { replyHandler(nil, error.localizedDescription) }
            }
            return
        }
        switch command {
        case "init": replyHandler(restoring ? "{\"restoring\":true}" : "{}", nil)
        default: replyHandler(nil, "Unknown native request")
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        restoring = navigationAction.navigationType == .backForward
        decisionHandler(url?.scheme == "gallery" && url?.host == "app" ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { saveSession() }
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
