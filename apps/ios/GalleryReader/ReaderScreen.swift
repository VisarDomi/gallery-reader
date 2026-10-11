import UIKit
import KitCore
import KitImages
import KitNavigation
import KitReader

// A gallery's pages, full width on black with half a screen above the first and below the
// last, zoomed and panned as Safari zooms a page. Opened from a thumbnail, that page's top sits
// at the screen's middle; reopened at the page it was left on, it returns exactly there.
// Image addresses come from the provider each time (Hitomi's hosts move); the images stay on
// the phone.
@MainActor
final class ReaderScreen: UIViewController, LiveScreen, StripReaderDelegate {
    private let app: AppController
    private let gallery: Int
    private var page: Int
    private let strip: StripReaderView
    private let message = UILabel()
    private var info: GalleryInfo?
    private var initial: StripPosition

    init(app: AppController, gallery: Int, page: Int, state: Data?) {
        self.app = app
        self.gallery = gallery
        self.page = max(1, page)
        strip = StripReaderView(pipeline: app.pipeline)
        if let saved = state.flatMap({ try? JSONDecoder().decode(StripPosition.self, from: $0) }) { initial = saved }
        else if let saved = app.state.readerPosition(gallery), saved.index == page - 1 { initial = saved }
        else { initial = StripPosition(index: page - 1, fraction: 0) }
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    var allowsEdgeBack: Bool { !strip.isZoomed }

    var route: Data { (try? JSONEncoder().encode(Route.reader(gallery: gallery, page: page))) ?? Data() }
    func savedState() -> Data? { try? JSONEncoder().encode(strip.currentPosition ?? initial) }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        strip.delegate = self
        view.addSubview(strip)
        message.textColor = UIColor(white: 0.73, alpha: 1)
        message.numberOfLines = 0
        message.isHidden = true
        view.addSubview(message)
        DebugState.shared.register("reader") { [weak self] in
            guard let self else { return [:] }
            return ["gallery": gallery, "pages": info?.pages.count ?? -1, "message": message.isHidden ? "" : (message.text ?? ""), "strip": strip.state]
        }
        Task { [weak self] in await self?.open() }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        // Back from the forward list while the gallery was still unknown: try again.
        if info == nil && !opening { Task { [weak self] in await self?.open() } }
    }

    private var opening = false

    // The gallery's pages (the phone's copy at once; otherwise the site, asked again with a
    // growing pause while the network is away, as long as the screen is in the stack).
    private func open() async {
        guard info == nil, !opening else { return }
        opening = true
        defer { opening = false }
        var delay = 1.0
        while info == nil {
            do {
                let info = try await app.details.info(gallery)
                self.info = info
                show(info.pages.isEmpty ? "This gallery has no images." : nil)
                strip.setPages(info.pages.enumerated().map { index, page in
                    StripPage(key: "\(app.provider.id.rawValue):image:\(page.image)",
                              aspect: page.width > 0 && page.height > 0 ? CGFloat(page.width / page.height) : nil)
                }, position: StripPosition(index: min(max(0, initial.index), max(0, info.pages.count - 1)), fraction: initial.fraction))
                return
            } catch {
                show(Self.offline(error) ? "Waiting for the network…" : "Could not open the gallery: \(error.localizedDescription)\nTrying again…")
                guard navigationController != nil else { return }
                try? await Task.sleep(for: .seconds(delay))
                delay = min(delay * 2, 30)
            }
        }
    }

    static func offline(_ error: Error) -> Bool {
        guard let error = error as? URLError else { return false }
        return [.notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost, .cannotConnectToHost, .dataNotAllowed,
                .internationalRoamingOff].contains(error.code)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        strip.frame = view.bounds
        let insets = view.safeAreaInsets
        let size = message.sizeThatFits(CGSize(width: view.bounds.width - 32, height: .greatestFiniteMagnitude))
        message.frame = CGRect(x: 16, y: max(insets.top, 16), width: view.bounds.width - 32, height: size.height)
    }

    private func show(_ text: String?) {
        message.text = text
        message.isHidden = text == nil
        view.setNeedsLayout()
    }

    func strip(_ strip: StripReaderView, sourceFor index: Int) -> ImageSource {
        guard let info, info.pages.indices.contains(index) else { return .load { throw CancellationError() } }
        return app.image(info.pages[index], of: gallery)
    }

    // A page that could not load says why (it is asked again, sooner while on screen).
    func strip(_ strip: StripReaderView, failureTextFor index: Int, error: Error) -> String? {
        Self.offline(error) ? "Page \(index + 1): waiting for the network…" : "Page \(index + 1) could not load: \(error.localizedDescription)"
    }

    func strip(_ strip: StripReaderView, settledAt position: StripPosition) {
        page = position.index + 1
        app.state.setReaderPosition(position, for: gallery)
        stateChanged()
    }
}
