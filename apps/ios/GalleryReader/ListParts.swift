import UIKit
import KitImages
import KitLists

@MainActor
protocol SearchHeaderDelegate: AnyObject {
    func header(_ header: SearchHeader, submit query: String)
    func headerChangedHeight(_ header: SearchHeader)
    func headerSuggestionsFrame(_ header: SearchHeader, below field: UIView) -> CGRect
    func headerWantsFavorites(_ header: SearchHeader)
}

// The search box (it grows with its text; Return searches, an empty box searches
// language:japanese), Hitomi's suggestions for the word at the cursor, the saved searches (the
// three latest, one line each, "Show N more", × to forget one), the count and Favs (the
// favorites from a search; from the favorites, back to the search).
@MainActor
final class SearchHeader: UIView, UITextViewDelegate, UITableViewDataSource, UITableViewDelegate {
    weak var delegate: SearchHeaderDelegate?
    private let app: AppController
    private let field = UITextView()
    private let placeholder = UILabel()
    // Not typing, the search shows on one line like its saved chip (a long one keeps its start
    // and end); a tap opens the whole of it for editing.
    private let collapsed = UIControl()
    private let collapsedLabel = UILabel()
    private let searches = UIStackView()
    private let countLabel = UILabel()
    private let favorites = UIButton(type: .system)
    let suggestions = UITableView(frame: .zero, style: .plain)
    private var results: [Suggestion] = []
    private var suggesting: Task<Void, Never>?
    private var expanded = false
    private var term: (range: NSRange, minus: String)?

    var count: String = "" { didSet { countLabel.text = count } }
    // On the favorites screen the button is lit (and leads back to the search).
    var showingFavorites = false { didSet { styleFavorites() } }
    var isEditing: Bool { field.isFirstResponder }

    init(app: AppController, query: String) {
        self.app = app
        super.init(frame: .zero)
        backgroundColor = UIColor(white: 0.067, alpha: 1)
        field.text = query
        field.font = .systemFont(ofSize: 16)
        field.textColor = UIColor(white: 0.87, alpha: 1)
        field.backgroundColor = UIColor(white: 0.133, alpha: 1)
        field.layer.borderColor = UIColor(white: 0.33, alpha: 1).cgColor
        field.layer.borderWidth = 1
        field.isScrollEnabled = false
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.smartQuotesType = .no
        field.smartDashesType = .no
        field.returnKeyType = .search
        field.textContainerInset = UIEdgeInsets(top: 5, left: 4, bottom: 5, right: 4)
        field.delegate = self
        addSubview(field)
        placeholder.text = "Search..."
        placeholder.textColor = UIColor(white: 0.45, alpha: 1)
        placeholder.font = .systemFont(ofSize: 16)
        placeholder.isHidden = !query.isEmpty
        field.addSubview(placeholder)
        collapsed.backgroundColor = field.backgroundColor
        collapsed.layer.borderColor = field.layer.borderColor
        collapsed.layer.borderWidth = 1
        collapsedLabel.font = field.font
        collapsedLabel.numberOfLines = 1
        collapsedLabel.lineBreakMode = .byTruncatingMiddle
        collapsed.addSubview(collapsedLabel)
        collapsed.addAction(UIAction { [weak self] _ in self?.beginEditing() }, for: .touchUpInside)
        collapsed.isAccessibilityElement = true
        collapsed.accessibilityTraits = .searchField
        addSubview(collapsed)
        updateCollapsed()
        searches.axis = .vertical
        searches.spacing = 4
        addSubview(searches)
        countLabel.font = .systemFont(ofSize: 16)
        countLabel.textColor = UIColor(white: 0.53, alpha: 1)
        addSubview(countLabel)
        favorites.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            delegate?.headerWantsFavorites(self)
        }, for: .touchUpInside)
        addSubview(favorites)
        styleFavorites()
        suggestions.backgroundColor = UIColor(white: 0.133, alpha: 1)
        suggestions.layer.borderColor = UIColor(red: 0.27, green: 0.53, blue: 0.73, alpha: 1).cgColor
        suggestions.layer.borderWidth = 1
        suggestions.rowHeight = 36
        suggestions.dataSource = self
        suggestions.delegate = self
        suggestions.isHidden = true
        suggestions.register(UITableViewCell.self, forCellReuseIdentifier: "suggestion")
        reloadSearches()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    // MARK: layout

    func height(for width: CGFloat, topInset: CGFloat) -> CGFloat { arrange(width: width, top: topInset, apply: false) }

    override func layoutSubviews() {
        super.layoutSubviews()
        _ = arrange(width: bounds.width, top: window?.safeAreaInsets.top ?? 0, apply: true)
    }

    private func arrange(width: CGFloat, top: CGFloat, apply: Bool) -> CGFloat {
        let fieldHeight = field.isFirstResponder ? max(30, field.sizeThatFits(CGSize(width: width - 8, height: .greatestFiniteMagnitude)).height) : 30
        var y = max(top, 4)
        if apply {
            field.frame = CGRect(x: 4, y: y, width: width - 8, height: fieldHeight)
            placeholder.frame = CGRect(x: 9, y: 5, width: width - 30, height: 20)
            // The text where the field draws it (inset 4 plus the line's padding 5).
            collapsed.frame = field.frame
            collapsedLabel.frame = CGRect(x: 9, y: 0, width: max(0, width - 8 - 18), height: fieldHeight)
            updateCollapsed()
        }
        y += fieldHeight + 6
        let searchesHeight = searches.arrangedSubviews.isEmpty ? 0 : searches.systemLayoutSizeFitting(CGSize(width: width - 8, height: 0),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        if apply { searches.frame = CGRect(x: 4, y: y, width: width - 8, height: searchesHeight) }
        y += searchesHeight + (searchesHeight > 0 ? 6 : 0)
        if apply {
            let buttonWidth: CGFloat = 92
            countLabel.frame = CGRect(x: 8, y: y, width: width - 16 - buttonWidth, height: 24)
            favorites.frame = CGRect(x: width - 4 - buttonWidth, y: y - 4, width: buttonWidth, height: 32)
        }
        return y + 30
    }

    private func styleFavorites() {
        var configuration = UIButton.Configuration.plain()
        configuration.title = "Favs"
        configuration.image = UIImage(systemName: showingFavorites ? "heart.fill" : "heart")
        configuration.imagePadding = 6
        configuration.baseForegroundColor = showingFavorites ? UIColor(red: 1, green: 0.27, blue: 0.33, alpha: 1) : UIColor(red: 0.4, green: 0.67, blue: 1, alpha: 1)
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
        favorites.configuration = configuration
        favorites.accessibilityLabel = showingFavorites ? "Favorites (back to the search)" : "Favorites"
    }

    // MARK: saved searches

    func reloadSearches() {
        searches.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let saved = app.state.data.searches
        for search in expanded ? saved : Array(saved.prefix(3)) { searches.addArrangedSubview(chip(search.query)) }
        if !expanded && saved.count > 3 {
            var configuration = UIButton.Configuration.plain()
            configuration.title = "Show \(saved.count - 3) more"
            configuration.baseForegroundColor = UIColor(red: 0.4, green: 0.67, blue: 1, alpha: 1)
            configuration.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8)
            let more = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in
                self?.expanded = true
                self?.reloadSearches()
            })
            more.contentHorizontalAlignment = .leading
            searches.addArrangedSubview(more)
        }
        setNeedsLayout()
        delegate?.headerChangedHeight(self)
    }

    private func chip(_ query: String) -> UIView {
        let chip = UIView()
        chip.backgroundColor = UIColor(white: 0.133, alpha: 1)
        chip.layer.cornerRadius = 4
        let label = UILabel()
        label.text = query
        label.textColor = UIColor(white: 0.53, alpha: 1)
        label.font = .systemFont(ofSize: 16)
        // One line each: a long search keeps its start and end.
        label.numberOfLines = 1
        label.lineBreakMode = .byTruncatingMiddle
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let remove = UIButton(type: .system)
        remove.setTitle("\u{00D7}", for: .normal)
        remove.tintColor = UIColor(white: 0.33, alpha: 1)
        remove.titleLabel?.font = .systemFont(ofSize: 20)
        remove.addAction(UIAction { [weak self] _ in self?.app.state.removeSearch(query) }, for: .touchUpInside)
        let row = UIStackView(arrangedSubviews: [label, remove])
        row.spacing = 6
        row.alignment = .center
        row.isLayoutMarginsRelativeArrangement = true
        row.layoutMargins = UIEdgeInsets(top: 4, left: 8, bottom: 4, right: 4)
        remove.setContentHuggingPriority(.required, for: .horizontal)
        remove.widthAnchor.constraint(equalToConstant: 32).isActive = true
        row.translatesAutoresizingMaskIntoConstraints = false
        chip.addSubview(row)
        NSLayoutConstraint.activate([row.leadingAnchor.constraint(equalTo: chip.leadingAnchor), row.trailingAnchor.constraint(equalTo: chip.trailingAnchor),
                                     row.topAnchor.constraint(equalTo: chip.topAnchor), row.bottomAnchor.constraint(equalTo: chip.bottomAnchor)])
        chip.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(chipTapped(_:))))
        chip.accessibilityLabel = query
        return chip
    }

    @objc private func chipTapped(_ tap: UITapGestureRecognizer) {
        guard let query = tap.view?.accessibilityLabel else { return }
        field.text = query
        updateCollapsed()
        delegate?.header(self, submit: query)
    }

    // MARK: typing

    private func updateCollapsed() {
        let text = field.text ?? ""
        collapsedLabel.text = text.isEmpty ? placeholder.text : text
        collapsedLabel.textColor = text.isEmpty ? placeholder.textColor : field.textColor
        collapsed.accessibilityValue = text
        let editing = field.isFirstResponder
        field.isHidden = !editing
        collapsed.isHidden = editing
    }

    private func beginEditing() {
        field.isHidden = false
        collapsed.isHidden = true
        field.becomeFirstResponder()
        field.selectedRange = NSRange(location: (field.text as NSString).length, length: 0)
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
        updateCollapsed()
        setNeedsLayout()
        delegate?.headerChangedHeight(self)
    }

    func textViewDidEndEditing(_ textView: UITextView) {
        hideSuggestions()
        updateCollapsed()
        setNeedsLayout()
        delegate?.headerChangedHeight(self)
    }

    func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
        guard text == "\n" else { return true }
        let query = textView.text.trimmingCharacters(in: .whitespacesAndNewlines)
        hideSuggestions()
        delegate?.header(self, submit: query.isEmpty ? "language:japanese" : query)
        return false
    }

    func textViewDidChange(_ textView: UITextView) {
        placeholder.isHidden = !textView.text.isEmpty
        setNeedsLayout()
        delegate?.headerChangedHeight(self)
        suggest()
    }

    // Hitomi's suggestions for the word at the cursor (its leading "-" kept).
    private func suggest() {
        suggesting?.cancel()
        hideSuggestions()
        guard app.provider.supportsSuggestions, field.selectedRange.length == 0 else { return }
        let text = field.text as NSString
        let cursor = field.selectedRange.location
        let before = text.substring(to: cursor)
        guard let match = before.range(of: #"(?:^|\s)(-?)([^\s]+)$"#, options: .regularExpression) else { return }
        var word = String(before[match]).trimmingCharacters(in: .whitespaces)
        var minus = ""
        if word.hasPrefix("-") { minus = "-"; word.removeFirst() }
        let afterWord = (text.substring(from: cursor).prefix { !$0.isWhitespace }).utf16.count
        let start = cursor - word.utf16.count - minus.utf16.count
        let range = NSRange(location: start, length: cursor + afterWord - start)
        let value = field.text
        suggesting = Task { [weak self, app] in
            try? await Task.sleep(for: .milliseconds(120))
            guard !Task.isCancelled, let found = try? await app.provider.suggestions(word), let self, !Task.isCancelled, field.text == value else { return }
            results = found
            term = (range, minus)
            suggestions.reloadData()
            suggestions.isHidden = found.isEmpty
            if let frame = delegate?.headerSuggestionsFrame(self, below: field) {
                suggestions.frame = CGRect(x: frame.minX, y: frame.minY, width: frame.width, height: min(frame.height, CGFloat(found.count) * suggestions.rowHeight))
            }
            suggestions.superview?.bringSubviewToFront(suggestions)
        }
    }

    func hideSuggestions() {
        suggestions.isHidden = true
        results = []
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { results.count }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "suggestion", for: indexPath)
        let result = results[indexPath.row]
        var content = UIListContentConfiguration.valueCell()
        let text = NSMutableAttributedString(string: result.name, attributes: [.foregroundColor: UIColor(white: 0.73, alpha: 1)])
        text.append(NSAttributedString(string: " (\(result.namespace))", attributes: [.foregroundColor: UIColor(white: 0.47, alpha: 1)]))
        content.attributedText = text
        content.secondaryText = String(result.count)
        content.secondaryTextProperties.color = UIColor(white: 0.4, alpha: 1)
        content.secondaryTextProperties.font = .systemFont(ofSize: 12)
        cell.contentConfiguration = content
        cell.backgroundColor = .clear
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        guard let term, results.indices.contains(indexPath.row) else { return }
        let result = results[indexPath.row]
        let replacement = term.minus + result.namespace + ":" + result.name.replacingOccurrences(of: " ", with: "_") + " "
        var text = field.text as NSString
        let after = text.substring(from: term.range.location + term.range.length)
        text = text.replacingCharacters(in: NSRange(location: term.range.location, length: text.length - term.range.location),
                                        with: replacement + (after.hasPrefix(" ") ? String(after.dropFirst()) : after)) as NSString
        field.text = text as String
        field.selectedRange = NSRange(location: term.range.location + (replacement as NSString).length, length: 0)
        placeholder.isHidden = true
        hideSuggestions()
        delegate?.headerChangedHeight(self)
    }
}

@MainActor
protocol ListRowDelegate: AnyObject {
    func row(_ row: ListRowCell, didSelectPage index: Int)
    func rowWantsInfo(_ row: ListRowCell)
    func rowToggledFavorite(_ row: ListRowCell)
    func rowStripSettled(_ row: ListRowCell)
}

// One gallery: its strip of page thumbnails (or a message until its details arrive), the "i"
// and heart buttons at the bottom right.
@MainActor
final class ListRowCell: UITableViewCell, ThumbnailStripDelegate {
    static let height: CGFloat = 300
    private(set) var gallery: Int?
    private var info: GalleryInfo?
    private weak var delegate: ListRowDelegate?
    private weak var app: AppController?
    private var strip: ThumbnailStripView?
    private let message = UILabel()
    private let infoButton = UIButton(type: .system)
    private let heart = UIButton(type: .system)

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        backgroundColor = .black
        contentView.backgroundColor = .black
        selectionStyle = .none
        message.textColor = UIColor(white: 0.53, alpha: 1)
        message.numberOfLines = 0
        contentView.addSubview(message)
        infoButton.setTitle("i", for: .normal)
        infoButton.titleLabel?.font = UIFont(name: "Georgia-Italic", size: 22) ?? .italicSystemFont(ofSize: 22)
        infoButton.tintColor = .white
        infoButton.addAction(UIAction { [weak self] _ in if let self { delegate?.rowWantsInfo(self) } }, for: .touchUpInside)
        contentView.addSubview(infoButton)
        heart.setPreferredSymbolConfiguration(UIImage.SymbolConfiguration(pointSize: 22, weight: .regular), forImageIn: .normal)
        heart.addAction(UIAction { [weak self] _ in if let self { delegate?.rowToggledFavorite(self) } }, for: .touchUpInside)
        contentView.addSubview(heart)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    var isPopulated: Bool { !(strip?.isHidden ?? true) }

    // Off screen (a reader covers the list): its thumbnails stop asking; back, they ask again.
    func pauseImages() { strip?.cancelAll() }
    func resumeImages() { strip?.reloadMissing() }
    var stripOffset: CGFloat { strip?.offset ?? 0 }

    override func layoutSubviews() {
        super.layoutSubviews()
        let bounds = contentView.bounds
        strip?.frame = CGRect(x: 0, y: 0, width: bounds.width, height: Self.height)
        message.frame = CGRect(x: 8, y: 12, width: bounds.width - 16, height: 0)
        message.sizeToFit()
        heart.frame = CGRect(x: bounds.width - 54, y: bounds.height - 54, width: 44, height: 44)
        infoButton.frame = CGRect(x: bounds.width - 98, y: bounds.height - 54, width: 44, height: 44)
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        strip?.cancelAll()
    }

    func configure(gallery id: Int, info: GalleryInfo?, failure: String?, offset: CGFloat, favorite: Bool, app: AppController, delegate: ListRowDelegate) {
        let same = gallery == id && self.info != nil
        gallery = id
        self.app = app
        self.delegate = delegate
        setFavorite(favorite)
        infoButton.accessibilityLabel = "Information"
        if strip == nil {
            let strip = ThumbnailStripView(pipeline: app.pipeline)
            strip.delegate = self
            contentView.insertSubview(strip, at: 0)
            self.strip = strip
        }
        guard let strip else { return }
        if let info {
            message.isHidden = true
            if !(same && strip.keys.count == info.pages.count && !strip.isHidden) {
                self.info = info
                strip.setKeys(info.pages.map(\.thumbnail), offset: offset)
            }
            strip.isHidden = false
        } else {
            self.info = nil
            strip.isHidden = true
            strip.setKeys([])
            message.isHidden = failure == nil
            message.text = failure.map { "Gallery \(id): \($0)" }
        }
        setNeedsLayout()
    }

    func setFavorite(_ favorite: Bool) {
        heart.setImage(UIImage(systemName: favorite ? "heart.fill" : "heart"), for: .normal)
        heart.tintColor = favorite ? UIColor(red: 1, green: 0.23, blue: 0.3, alpha: 1) : .white
        heart.accessibilityLabel = favorite ? "Remove from favorites" : "Add to favorites"
    }

    func strip(_ strip: ThumbnailStripView, sourceFor index: Int) -> ImageSource {
        guard let info, info.pages.indices.contains(index), let app else { return .load { throw CancellationError() } }
        return app.thumbnail(info.pages[index])
    }

    func strip(_ strip: ThumbnailStripView, localFileFor index: Int) -> URL? {
        guard let info, info.pages.indices.contains(index), let app else { return nil }
        return app.thumbnailFile(info.pages[index])
    }

    func strip(_ strip: ThumbnailStripView, didSelect index: Int) { delegate?.row(self, didSelectPage: index) }
    func stripDidSettle(_ strip: ThumbnailStripView) { delegate?.rowStripSettled(self) }
}

// Favorites' end: "Import / Merge" (gallery IDs pasted in any form; new ones go first) and
// "Export" (the IDs, newest first, ready to copy).
@MainActor
final class FavoritesFooter: UIView {
    weak var app: AppController?
    var onImport: (() -> Void)?
    private let importButton = UIButton(type: .system)
    private let exportButton = UIButton(type: .system)
    private let mergeButton = UIButton(type: .system)
    private let text = UITextView()
    private let status = UILabel()
    private var open = false

    init() {
        super.init(frame: .zero)
        backgroundColor = .black
        for (button, title) in [(importButton, "Import / Merge"), (exportButton, "Export"), (mergeButton, "Merge")] {
            var configuration = UIButton.Configuration.filled()
            configuration.title = title
            configuration.baseBackgroundColor = button === mergeButton ? UIColor(red: 0.27, green: 0.67, blue: 0.27, alpha: 1) : UIColor(white: 0.2, alpha: 1)
            configuration.baseForegroundColor = button === mergeButton ? .white : UIColor(white: 0.8, alpha: 1)
            configuration.attributedTitle = AttributedString(title, attributes: AttributeContainer([.font: UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)]))
            button.configuration = configuration
            addSubview(button)
        }
        importButton.addAction(UIAction { [weak self] _ in self?.show(nil) }, for: .touchUpInside)
        exportButton.addAction(UIAction { [weak self] _ in self?.show(self?.app?.state.exportText ?? "") }, for: .touchUpInside)
        mergeButton.addAction(UIAction { [weak self] _ in self?.merge() }, for: .touchUpInside)
        text.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        text.textColor = UIColor(white: 0.67, alpha: 1)
        text.backgroundColor = UIColor(white: 0.067, alpha: 1)
        text.layer.borderColor = UIColor(white: 0.33, alpha: 1).cgColor
        text.layer.borderWidth = 1
        text.layer.cornerRadius = 4
        text.keyboardType = .asciiCapable
        text.isHidden = true
        mergeButton.isHidden = true
        addSubview(text)
        status.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        status.textColor = UIColor(white: 0.67, alpha: 1)
        addSubview(status)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    func height(for width: CGFloat, bottomInset: CGFloat) -> CGFloat {
        let content: CGFloat = open ? 208 : 80
        return content + max(16, bottomInset)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = bounds.width
        var y: CGFloat = 16
        if open {
            text.frame = CGRect(x: max(8, (width - 500) / 2), y: y, width: min(500, width - 16), height: 120)
            y += 128
        }
        let buttons = [open ? mergeButton : importButton, exportButton]
        let widths = buttons.map { $0.intrinsicContentSize.width }
        var x = (width - widths.reduce(0, +) - 8) / 2
        for (button, buttonWidth) in zip(buttons, widths) {
            button.frame = CGRect(x: x, y: y, width: buttonWidth, height: 36)
            x += buttonWidth + 8
        }
        status.frame = CGRect(x: 8, y: y + 44, width: width - 16, height: 20)
        status.textAlignment = .center
    }

    private func show(_ value: String?) {
        open = true
        text.isHidden = false
        mergeButton.isHidden = false
        importButton.isHidden = true
        if let value { text.text = value }
        status.text = nil
        (superview as? UITableView)?.tableFooterView = self
        superview?.setNeedsLayout()
    }

    private func merge() {
        guard let app else { return }
        let result = app.state.importFavorites(text.text)
        status.text = result.total > 0 ? "Added \(result.added) of \(result.total) IDs" : "No IDs found"
        endEditing(true)
        onImport?()
    }
}
