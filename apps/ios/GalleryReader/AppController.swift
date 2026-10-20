import UIKit
import KitBackup
import KitCore
import KitImages
import KitLifecycle
import KitMigration
import KitNavigation
import KitNet
import KitTestHooks

// Where a screen is.
enum Route: Codable, Hashable, Sendable {
    case favorites
    case search(String)
    case reader(gallery: Int, page: Int)
}

// The app: its provider (Hitomi or Imhentai, chosen at build time), the phone's copies of
// galleries, searches and images, the reader's state, the navigation stack, and the PC
// (backups of favorites and searches; the favorites list for Gallery Downloader).
@MainActor
final class AppController {
    let provider: any GalleryProvider
    let state: ReaderState
    let details: GalleryDetails
    let images: ImageCache
    let searches: SearchCache
    let pipeline = ImagePipeline(memoryLimit: 192 << 20, concurrency: 6)
    // Details and thumbnails fetched ahead of the list on screen (Prefetch.swift).
    lazy var prefetch = Prefetch(app: self)
    let root: URL
    private(set) var navigation: LiveNavigationController!
    private(set) var backup: PCBackup?
    private let pcHTTP: HTTPClient
    private let galleryServer: URL
    private var syncTimer: Timer?
    private var syncing = false
    private var syncPending = false
    let toasts = Toasts()

    init() {
        root = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support/GalleryReader")
        let info = Bundle.main.infoDictionary ?? [:]
        let providerID = ProviderID(rawValue: info["ReaderProvider"] as? String ?? "hitomi") ?? .hitomi
        let cookies = CookieJar(file: root.appendingPathComponent("cookies.json"))
        let site = HTTPClient(.init(referer: providerID == .hitomi ? "https://hitomi.la/" : "https://imhentai.xxx/", cookies: cookies,
                                    connectionsPerHost: 6, requestTimeout: 25, resourceTimeout: 90))
        provider = providerID == .hitomi ? Hitomi(http: site) : Imhentai(http: site)
        state = ReaderState(directory: root)
        details = GalleryDetails(provider: provider, directory: root)
        images = ImageCache(directory: root, http: HTTPClient(.init(cookies: cookies, connectionsPerHost: 12, requestTimeout: 25, resourceTimeout: 45)), hitomi: providerID == .hitomi)
        searches = SearchCache(directory: root, provider: providerID)
        galleryServer = URL(string: info["GalleryServerURL"] as? String ?? "https://192.168.1.197:7777")!
        let trust = LocalTrust(host: galleryServer.host ?? "", certificate: Bundle.main.url(forResource: "LocalCA", withExtension: "cer"))
        pcHTTP = HTTPClient(.init(trust: trust, connectionsPerHost: 2, requestTimeout: 8, resourceTimeout: 8))
        if let base = (info["BackupURL"] as? String).flatMap(URL.init(string:)), let key = info["BackupKey"] as? String, !key.isEmpty {
            backup = PCBackup(scope: "gallery-reader:" + providerID.rawValue, base: base, key: key, trust: trust, directory: root,
                              capture: { [unowned self] in state.backupData() },
                              restore: { [unowned self] data in state.replace(with: try ReaderState.validateBackup(data)) },
                              stats: { try ReaderState.describe(ReaderState.validateBackup($0)) })
        }
    }

    func makeNavigation() -> LiveNavigationController {
        // The screens come back as they were left, their images on the phone in the first frame.
        pipeline.beginRestore()
        navigation = LiveNavigationController(file: root.appendingPathComponent("navigation.json"),
                                              factory: { [unowned self] route, state in screen(route, state: state) },
                                              root: ListScreen(app: self, kind: .favorites, state: nil))
        AppLifecycle.shared.onResignActive { [weak self] in
            guard let self else { return }
            navigation.flush()
            state.flush()
            Task { [images, root] in
                let transfers = await images.debugState
                DebugState.shared.register("downloads") { transfers }
                DebugState.shared.write(to: root)
            }
        }
        NotificationCenter.default.addObserver(forName: .favoritesChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.scheduleFavoritesSync() }
        }
        DebugState.shared.register("navigation") { [weak self] in
            self?.navigation.screens.compactMap { try? JSONDecoder().decode(Route.self, from: $0.route) }.map { "\($0)" } ?? []
        }
        DebugState.shared.register("state") { [weak self] in
            guard let self else { return [:] }
            return ["favorites": state.data.favorites.count, "searches": state.data.searches.map(\.query), "pipeline": pipeline.state]
        }
        #if targetEnvironment(simulator)
        TestHooks.shared.back = { [weak self] in _ = self?.navigation.popViewController(animated: true) }
        TestHooks.shared.forward = { [weak self] in self?.navigation.goForward() }
        TestHooks.shared.register("search") { [weak self] query in
            self?.open(.search(query["query"] ?? "language:japanese")); return ["ok": true]
        }
        TestHooks.shared.register("favorite") { [weak self] query in
            guard let self, let id = Int(query["id"] ?? "") else { return ["error": "id"] }
            return ["favorite": state.toggleFavorite(id)]
        }
        TestHooks.shared.register("open") { [weak self] query in
            guard let self, let id = Int(query["gallery"] ?? ""), id > 0 else { return ["error": "gallery"] }
            open(.reader(gallery: id, page: max(1, Int(query["page"] ?? "1") ?? 1)))
            return ["ok": true]
        }
        TestHooks.shared.register("downloads") { [weak self] _ in
            guard let self else { return ["requested": false] }
            Task { [images] in
                let transfers = await images.debugState
                DebugState.shared.register("downloads") { transfers }
            }
            return ["requested": true]
        }
        TestHooks.shared.start()
        #endif
        migrateFromWebKit()
        Task.detached(priority: .background) { [images] in await images.trim(limit: 2 << 30) }
        return navigation
    }

    func screen(_ route: Data, state: Data?) -> (any LiveScreen)? {
        guard let route = try? JSONDecoder().decode(Route.self, from: route) else { return nil }
        switch route {
        case .favorites: return ListScreen(app: self, kind: .favorites, state: state)
        case .search(let query): return ListScreen(app: self, kind: .search(query), state: state)
        case .reader(let gallery, let page): return ReaderScreen(app: self, gallery: gallery, page: page, state: state)
        }
    }

    func open(_ route: Route) {
        switch route {
        case .favorites: navigation.open(ListScreen(app: self, kind: .favorites, state: nil))
        case .search(let query):
            state.saveSearch(query)
            navigation.open(ListScreen(app: self, kind: .search(query), state: nil))
        case .reader(let gallery, let page): navigation.open(ReaderScreen(app: self, gallery: gallery, page: page, state: nil))
        }
    }

    // The favorites are the stack's root: from a search, go back to them (what was above stays
    // for going forward); from the favorites, go forward again, else stay.
    func toggleFavorites(from screen: UIViewController) {
        if (screen as? ListScreen)?.kind == .favorites {
            if navigation.canGoForward { navigation.goForward() }
        } else if let root = navigation.viewControllers.first as? ListScreen, root.kind == .favorites {
            _ = navigation.popToRootViewController(animated: true)
        } else {
            open(.favorites)
        }
    }

    // MARK: images

    func thumbnail(_ page: GalleryInfo.Page) -> ImageSource {
        let images = images, referer = provider.origin.absoluteString + "/", raw = page.thumbnail
        return .load {
            try await images.file(raw) { _ in
                guard let url = URL(string: raw) else { throw ProviderError.invalid("Invalid thumbnail URL") }
                return (url, referer)
            }
        }
    }

    func thumbnailFile(_ page: GalleryInfo.Page) -> URL? { images.localFile(page.thumbnail) }
    func imageFile(_ page: GalleryInfo.Page) -> URL? { images.localFile("\(provider.id.rawValue):image:\(page.image)") }

    func image(_ page: GalleryInfo.Page, of gallery: Int) -> ImageSource {
        let images = images, provider = provider
        return .load {
            try await images.file("\(provider.id.rawValue):image:\(page.image)") { stale in try await provider.image(page, of: gallery, stale: stale) }
        }
    }

    // MARK: the PC

    // The first launch carries the web version's data out of WebKit's IndexedDB (favorites,
    // saved searches, positions, and the backup identity), once.
    private func migrateFromWebKit() {
        let marker = root.appendingPathComponent("webkit-migrated")
        guard !FileManager.default.fileExists(atPath: marker.path) else { return }
        let scope = "gallery-reader:" + provider.id.rawValue
        let script = """
        const read = (name, store, key) => new Promise((resolve, reject) => {
          const open = indexedDB.open(name);
          open.onupgradeneeded = () => { open.transaction.abort(); resolve(null); };
          open.onerror = () => resolve(null);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains(store)) { db.close(); resolve(null); return; }
            const request = db.transaction(store, 'readonly').objectStore(store).get(key);
            request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
            request.onerror = () => { db.close(); reject(request.error); };
          };
        });
        return { state: await read('gallery-reader-data', 'state', 'reader'), identity: await read('reader-pc-backup-state-v1', 'identities', '\(scope)') };
        """
        let reader = WebStorageReader()
        Task { [weak self] in
            guard let result = try? await reader.read(URL(string: "gallery://app/")!, customScheme: "gallery", script: script) as? [String: Any],
                  let self else { return }
            if let record = result["state"], !(record is NSNull), let data = try? ReaderState.validate(record), !state.exists || state.data.favorites.isEmpty {
                state.replace(with: data)
                Log.store.info("Moved \(data.favorites.count) favorites and \(data.searches.count) searches out of WebKit")
            }
            if let identity = result["identity"] as? [String: Any], let id = identity["id"] as? String, let label = identity["label"] as? String,
               backup?.identity == nil {
                backup?.identity = BackupIdentity(id: id, label: label, revision: identity["revision"] as? String)
            }
            try? DurableFile.write(Data(), to: marker)
        }
    }

    // Favorites go to Gallery Downloader shortly after a change (only once this phone chose
    // backup or restore); a failure waits for the next change or launch.
    func scheduleFavoritesSync(after delay: TimeInterval = 0.1) {
        syncPending = true
        syncTimer?.invalidate()
        syncTimer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.syncFavorites() }
        }
    }

    private func syncFavorites() {
        guard !syncing, syncPending, backup?.enrolled == true else { return }
        syncing = true
        syncPending = false
        let body = try? JSONSerialization.data(withJSONObject: ["ids": state.data.favorites])
        let url = galleryServer.appendingPathComponent("api/favorites/" + provider.id.rawValue)
        Task { [pcHTTP] in
            do { _ = try await pcHTTP.send(HTTPRequest(url, method: "PUT", headers: ["Content-Type": "application/json"], body: body)) }
            catch { Log.network.info("Favorites sync deferred: \(error.localizedDescription, privacy: .public)") }
            self.syncing = false
            if self.syncPending { self.syncFavorites() }
        }
    }

    // Each visit to the favorites: back up silently, or offer the first-use choice.
    func favoritesVisited(from screen: UIViewController) {
        guard let backup else { return }
        Task {
            do {
                if backup.identity != nil {
                    if try await backup.save() != nil {
                        toasts.clearError()
                        scheduleFavoritesSync(after: 0)
                    }
                    return
                }
                guard let choices = try await backup.list() else { return }
                guard screen.presentedViewController == nil else { return }
                screen.present(BackupSetupSheet(app: self, backup: backup, choices: choices), animated: true)
            } catch {
                toasts.show(error: "PC backup: " + error.localizedDescription)
            }
        }
    }

    func backupChosen(label: String, restoring choice: BackupChoice?) {
        guard let backup else { return }
        Task {
            do {
                try backup.choose(label: label, restoring: choice)
                if let saved = try await backup.save() {
                    toasts.show(message: "Backed up to PC: \(saved.label) · \(provider.id.rawValue)\n\(saved.stats)", for: 12)
                    scheduleFavoritesSync(after: 0)
                }
            } catch {
                toasts.show(error: "PC backup: " + error.localizedDescription)
            }
        }
    }
}
