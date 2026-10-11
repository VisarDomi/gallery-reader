import UIKit
import KitCore
import KitImages
import KitLists
import KitNavigation

enum ListKind: Equatable {
    case favorites
    case search(String)
}

// Favorites or a search's results: the search box (with Hitomi's suggestions) and the saved
// searches float on top (sliding away while scrolling down and back with any scroll up, as
// Safari's bars do, so search is always at hand without returning to the top), then every
// gallery in one continuous list (rows of page thumbnails with the
// "i" and heart buttons). A search shows the phone's copy of its results at once, searches
// again in the background and merges the new results without moving the rows on screen;
// Imhentai's further pages load as the end comes near. The list remembers the row at the
// screen's middle (per favorites and per search), every strip's sideways offset, and an open
// gallery's details.
@MainActor
final class ListScreen: UIViewController, LiveScreen, UITableViewDataSource, UITableViewDelegate,
                        UITableViewDataSourcePrefetching, ListRowDelegate, SearchHeaderDelegate {
    struct State: Codable {
        var anchor: ScrollAnchor?
        var strips: [Int: Double]
        var info: Int?
    }

    private let app: AppController
    let kind: ListKind
    private let table = UITableView(frame: .zero, style: .plain)
    private let header: SearchHeader
    private let footer = FavoritesFooter()
    private let status = UILabel()
    private var ids: [Int] = []
    private var cached: CachedSearch?
    private var galleries: [Int: GalleryInfo] = [:]
    // Galleries whose details failed: the message and when (asked again after 5 s while on
    // screen, or when the row shows again).
    private var failures: [Int: (message: String, at: CFTimeInterval)] = [:]
    private var describing = Set<Int>()
    private var strips: [Int: Double]
    private var pendingAnchor: ScrollAnchor?
    private var info: InfoSheet?
    private var pendingInfo: Int?
    private var restored = false
    private var loadingMore = false
    // The newest results are in (favorites at once; a search once it searched again).
    private var current = false
    // How far the floating header has slid up (0: fully shown).
    private var headerShift: CGFloat = 0
    private var lastOffset: CGFloat = 0
    private var observers: [NSObjectProtocol] = []

    init(app: AppController, kind: ListKind, state: Data?) {
        self.app = app
        self.kind = kind
        header = SearchHeader(app: app, query: { if case .search(let query) = kind { return query }; return "" }())
        let saved = state.flatMap { try? JSONDecoder().decode(State.self, from: $0) }
        strips = saved?.strips ?? [:]
        pendingInfo = saved?.info
        super.init(nibName: nil, bundle: nil)
        pendingAnchor = saved?.anchor ?? app.state.anchor(anchorKey)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    var route: Data {
        switch kind {
        case .favorites: (try? JSONEncoder().encode(Route.favorites)) ?? Data()
        case .search(let query): (try? JSONEncoder().encode(Route.search(query))) ?? Data()
        }
    }

    func savedState() -> Data? { try? JSONEncoder().encode(State(anchor: currentAnchor, strips: strips, info: info?.gallery ?? pendingInfo)) }

    private var anchorKey: String {
        switch kind {
        case .favorites: "favorites"
        case .search(let query): "search:" + query
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        table.backgroundColor = .black
        table.separatorStyle = .none
        table.rowHeight = ListRowCell.height
        table.estimatedRowHeight = ListRowCell.height
        table.contentInsetAdjustmentBehavior = .never
        table.keyboardDismissMode = .onDrag
        table.indicatorStyle = .white
        table.dataSource = self
        table.delegate = self
        table.prefetchDataSource = self
        table.register(ListRowCell.self, forCellReuseIdentifier: "row")
        view.addSubview(table)
        header.delegate = self
        header.showingFavorites = kind == .favorites
        view.addSubview(header)
        view.addSubview(header.suggestions)
        status.textColor = UIColor(white: 0.67, alpha: 1)
        status.numberOfLines = 0
        status.textAlignment = .center
        status.isHidden = true
        table.addSubview(status)
        if kind == .favorites {
            footer.app = app
            footer.onImport = { [weak self] in self?.reloadFavorites() }
        }
        observers.append(NotificationCenter.default.addObserver(forName: .favoritesChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.favoritesChanged() }
        })
        observers.append(NotificationCenter.default.addObserver(forName: .searchesChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.header.reloadSearches(); self?.layoutHeader() }
        })
        DebugState.shared.register("list") { [weak self] in
            guard let self else { return [:] }
            return ["kind": "\(kind)", "rows": ids.count, "anchor": currentAnchor.map { ["key": $0.key, "fraction": $0.fraction] } ?? [:],
                    "offset": table.contentOffset.y, "described": galleries.count, "cachedAt": cached?.savedAt.description ?? ""]
        }
        switch kind {
        case .favorites: reloadFavorites()
        case .search(let query): loadSearch(query)
        }
        if let gallery = pendingInfo { showInfo(gallery, animated: false) }
        pendingInfo = nil
    }

    // The screen on top gets the image connections: a covered list's thumbnails wait.
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        table.visibleCells.compactMap { $0 as? ListRowCell }.forEach { $0.resumeImages() }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        table.visibleCells.compactMap { $0 as? ListRowCell }.forEach { $0.pauseImages() }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if kind == .favorites { app.favoritesVisited(from: self) }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let anchor = restored ? currentAnchor : nil
        let widthChanged = table.frame.width != view.bounds.width
        table.frame = view.bounds
        layoutHeader()
        layoutFooter()
        info?.view.frame = view.bounds
        if widthChanged, let anchor { restore(anchor) }
        restoreIfReady()
    }

    private func layoutHeader() {
        let width = view.bounds.width
        let height = header.height(for: width, topInset: view.safeAreaInsets.top)
        headerShift = min(headerShift, height)
        header.frame = CGRect(x: 0, y: -headerShift, width: width, height: height)
        if table.contentInset.top != height {
            let atTop = table.contentOffset.y <= -table.adjustedContentInset.top + 1
            table.contentInset.top = height
            table.verticalScrollIndicatorInsets.top = height
            if atTop { table.contentOffset.y = -height }
        }
        status.frame = CGRect(x: 20, y: 40, width: width - 40, height: 80)
    }

    // Scrolling down slides the header away with the content; any scroll up brings it back.
    private func followScroll(_ scrollView: UIScrollView) {
        let offset = scrollView.contentOffset.y
        defer { lastOffset = offset }
        guard scrollView.isTracking || scrollView.isDecelerating, !header.isEditing else { return }
        let height = header.bounds.height
        let top = -scrollView.adjustedContentInset.top
        let delta = offset - lastOffset
        if offset <= top { headerShift = 0 }
        else if delta > 0 { headerShift = min(height, headerShift + delta) }
        else if delta < 0 { headerShift = max(0, headerShift + delta * 2) }
        header.frame.origin.y = -headerShift
    }

    // When the finger lifts, the header settles fully shown or fully away.
    private func settleHeader() {
        let height = header.bounds.height
        guard headerShift > 0, headerShift < height else { return }
        headerShift = headerShift > height / 2 && table.contentOffset.y > -table.adjustedContentInset.top + height ? height : 0
        UIView.animate(withDuration: 0.2) { self.header.frame.origin.y = -self.headerShift }
    }

    private func layoutFooter() {
        guard kind == .favorites else { return }
        let width = view.bounds.width
        let height = footer.height(for: width, bottomInset: view.safeAreaInsets.bottom)
        if footer.frame.size != CGSize(width: width, height: height) || table.tableFooterView !== footer {
            footer.frame = CGRect(x: 0, y: 0, width: width, height: height)
            table.tableFooterView = footer
        }
    }

    // MARK: contents

    private func setIDs(_ new: [Int], countSuffix: String, total: Int) {
        let anchor = restored ? currentAnchor : nil
        let changed = new != ids
        ids = new
        header.count = "~\(total)\(countSuffix)"
        layoutHeader()
        if changed {
            table.reloadData()
            table.layoutIfNeeded()
            if let anchor { restore(anchor) }
        }
        restoreIfReady()
    }

    private func reloadFavorites() {
        let favorites = app.state.data.favorites
        current = true
        setIDs(favorites, countSuffix: " Favorites", total: favorites.count)
        status.text = favorites.isEmpty ? "No favorites yet." : nil
        status.isHidden = !favorites.isEmpty
    }

    private func favoritesChanged() {
        if kind == .favorites { reloadFavorites() }
        for cell in table.visibleCells.compactMap({ $0 as? ListRowCell }) {
            if let id = cell.gallery { cell.setFavorite(app.state.isFavorite(id)) }
        }
    }

    private var paged: Bool { app.provider.id == .imhentai }

    private func loadSearch(_ query: String) {
        Task { [weak self, app] in
            if let kept = await app.searches.load(query), let self {
                cached = kept
                setIDs(kept.ids, countSuffix: " Results", total: kept.total)
            }
            do {
                let fresh = try await app.provider.search(query, page: 1)
                guard let self else { return }
                let merged = SearchCache.merge(cached, fresh: fresh, query: query, paged: paged)
                cached = merged
                current = true
                setIDs(merged.ids, countSuffix: " Results", total: merged.total)
                status.text = merged.ids.isEmpty ? "No results." : nil
                status.isHidden = !merged.ids.isEmpty
                await app.searches.save(merged)
            } catch {
                guard let self else { return }
                current = true
                restoreIfReady()
                guard ids.isEmpty else { return }
                status.text = "Search failed: \(error.localizedDescription)"
                status.isHidden = false
            }
        }
    }

    // Imhentai: the next page of 20 once the end is near.
    private func loadMoreIfNeeded(_ row: Int) {
        guard paged, case .search(let query) = kind, let current = cached, !current.complete, !loadingMore, row >= ids.count - 8 else { return }
        loadingMore = true
        Task { [weak self, app] in
            defer { self?.loadingMore = false }
            guard let page = try? await app.provider.search(query, page: current.pages + 1), let self, cached == current else { return }
            let next = SearchCache.append(current, page: page)
            cached = next
            setIDs(next.ids, countSuffix: " Results", total: next.total)
            await app.searches.save(next)
        }
    }

    private func describe(_ id: Int) {
        guard galleries[id] == nil, !describing.contains(id) else { return }
        describing.insert(id)
        Task { [weak self, app] in
            do {
                let info = try await app.details.info(id)
                guard let self else { return }
                describing.remove(id)
                galleries[id] = info
                failures[id] = nil
                if galleries.count > 300, let far = galleries.keys.first(where: { !self.isVisible($0) }) { galleries[far] = nil }
            } catch {
                guard let self else { return }
                describing.remove(id)
                failures[id] = (error.localizedDescription, CACurrentMediaTime())
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                    guard let self, isVisible(id) else { return }
                    describe(id)
                }
            }
            self?.refreshRow(id)
        }
    }

    private func isVisible(_ id: Int) -> Bool {
        table.indexPathsForVisibleRows?.contains { ids.indices.contains($0.row) && ids[$0.row] == id } ?? false
    }

    private func refreshRow(_ id: Int) {
        for path in table.indexPathsForVisibleRows ?? [] where ids.indices.contains(path.row) && ids[path.row] == id {
            if let cell = table.cellForRow(at: path) as? ListRowCell { configure(cell, row: path.row) }
        }
    }

    private func configure(_ cell: ListRowCell, row: Int) {
        let id = ids[row]
        cell.configure(gallery: id, info: galleries[id], failure: failures[id]?.message, offset: CGFloat(strips[id] ?? 0),
                       favorite: app.state.isFavorite(id), app: app, delegate: self)
        if galleries[id] == nil && CACurrentMediaTime() - (failures[id]?.at ?? 0) > 5 { describe(id) }
    }

    // MARK: table

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { ids.count }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "row", for: indexPath) as! ListRowCell
        configure(cell, row: indexPath.row)
        loadMoreIfNeeded(indexPath.row)
        return cell
    }

    func tableView(_ tableView: UITableView, prefetchRowsAt indexPaths: [IndexPath]) {
        for path in indexPaths where ids.indices.contains(path.row) { describe(ids[path.row]) }
    }

    func tableView(_ tableView: UITableView, didEndDisplaying cell: UITableViewCell, forRowAt indexPath: IndexPath) {
        guard let cell = cell as? ListRowCell, let id = cell.gallery, cell.isPopulated else { return }
        strips[id] = Double(cell.stripOffset)
    }

    func tableView(_ tableView: UITableView, shouldHighlightRowAt indexPath: IndexPath) -> Bool { false }

    // MARK: position

    private var currentAnchor: ScrollAnchor? {
        guard let paths = table.indexPathsForVisibleRows, !paths.isEmpty else { return nil }
        return ScrollAnchoring.anchor(in: table, items: paths.filter { ids.indices.contains($0.row) }.map { (String(ids[$0.row]), table.rectForRow(at: $0)) })
    }

    private func restore(_ anchor: ScrollAnchor) {
        guard let id = Int(anchor.key), let row = ids.firstIndex(of: id) else { return }
        ScrollAnchoring.restore(anchor, in: table, frame: table.rectForRow(at: IndexPath(row: row, section: 0)))
    }

    private func restoreIfReady() {
        // Only once the table has its frame (a restore before layout lands too low).
        guard !restored, table.bounds.height > 0 else { return }
        guard let anchor = pendingAnchor else { if !ids.isEmpty { restored = true }; return }
        guard let id = Int(anchor.key), ids.contains(id) else {
            // The kept results may lack the row; the newest decide.
            if current { restored = true; pendingAnchor = nil }
            return
        }
        table.layoutIfNeeded()
        restore(anchor)
        pendingAnchor = nil
        restored = true
    }

    private func saveNow() {
        guard restored else { return }
        for cell in table.visibleCells.compactMap({ $0 as? ListRowCell }) where cell.isPopulated {
            if let id = cell.gallery { strips[id] = Double(cell.stripOffset) }
        }
        app.state.setAnchor(currentAnchor, for: anchorKey)
        stateChanged()
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        app.pipeline.prioritiesChanged()
        if scrollView.isTracking { header.hideSuggestions() }
        followScroll(scrollView)
    }
    func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
        if !decelerate { saveNow(); settleHeader() }
    }
    func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { saveNow(); settleHeader() }

    // MARK: actions

    func row(_ row: ListRowCell, didSelectPage index: Int) {
        guard let id = row.gallery else { return }
        saveNow()
        app.open(.reader(gallery: id, page: index + 1))
    }

    func rowWantsInfo(_ row: ListRowCell) {
        guard let id = row.gallery else { return }
        showInfo(id, animated: true)
        stateChanged()
    }

    // The details are part of this screen (not presented over it), so they stay open under a
    // search started from them and come back with a swipe back or a relaunch.
    private func showInfo(_ gallery: Int, animated: Bool) {
        closeInfo(animated: false)
        let sheet = InfoSheet(app: app, gallery: gallery) { [weak self] query in
            self?.saveNow()
            self?.app.open(.search(query))
        }
        sheet.onClose = { [weak self] in
            self?.closeInfo(animated: true)
            self?.stateChanged()
        }
        addChild(sheet)
        sheet.view.frame = view.bounds
        view.addSubview(sheet.view)
        sheet.didMove(toParent: self)
        info = sheet
        header.hideSuggestions()
        view.endEditing(true)
        guard animated else { return }
        sheet.view.alpha = 0
        UIView.animate(withDuration: 0.2) { sheet.view.alpha = 1 }
    }

    private func closeInfo(animated: Bool) {
        guard let sheet = info else { return }
        info = nil
        sheet.willMove(toParent: nil)
        let remove = { sheet.view.removeFromSuperview(); sheet.removeFromParent() }
        guard animated else { remove(); return }
        UIView.animate(withDuration: 0.2, animations: { sheet.view.alpha = 0 }, completion: { _ in remove() })
    }

    func rowToggledFavorite(_ row: ListRowCell) {
        guard let id = row.gallery else { return }
        row.setFavorite(app.state.toggleFavorite(id))
    }

    func rowStripSettled(_ row: ListRowCell) { saveNow() }

    func header(_ header: SearchHeader, submit query: String) {
        view.endEditing(true)
        saveNow()
        app.open(.search(query))
    }

    func headerChangedHeight(_ header: SearchHeader) { layoutHeader() }

    // Favs: from a search, back to the favorites (the searches stay for a forward swipe); from
    // the favorites, forward to the search again.
    func headerWantsFavorites(_ header: SearchHeader) {
        view.endEditing(true)
        saveNow()
        app.toggleFavorites(from: self)
    }

    func headerSuggestionsFrame(_ header: SearchHeader, below field: UIView) -> CGRect {
        let frame = field.convert(field.bounds, to: view)
        return CGRect(x: frame.minX, y: frame.maxY + 5, width: frame.width, height: min(320, view.bounds.height - frame.maxY - 20))
    }
}
