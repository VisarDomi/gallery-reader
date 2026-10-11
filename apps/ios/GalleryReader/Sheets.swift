import UIKit
import KitBackup

// A gallery's details over a dimmed screen: its titles (Japanese first), then artists,
// groups, series, type, characters, language, pages, date and tags. Every value is a search
// (in the gallery's language). A tap outside or Close dismisses it.
@MainActor
final class InfoSheet: UIViewController {
    private let app: AppController
    private let gallery: Int
    private let onSearch: (String) -> Void
    private let card = UIView()
    private let scroll = UIScrollView()
    private let stack = UIStackView()
    private let close = UIButton(type: .system)

    init(app: AppController, gallery: Int, onSearch: @escaping (String) -> Void) {
        self.app = app
        self.gallery = gallery
        self.onSearch = onSearch
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .overFullScreen
        modalTransitionStyle = .crossDissolve
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    override var prefersStatusBarHidden: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0, alpha: 0.85)
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(outside(_:))))
        card.backgroundColor = UIColor(white: 0.118, alpha: 1)
        card.layer.cornerRadius = 12
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(white: 0.2, alpha: 1).cgColor
        view.addSubview(card)
        stack.axis = .vertical
        stack.spacing = 12
        scroll.addSubview(stack)
        card.addSubview(scroll)
        var configuration = UIButton.Configuration.filled()
        configuration.title = "Close"
        configuration.baseBackgroundColor = UIColor(white: 0.2, alpha: 1)
        configuration.baseForegroundColor = UIColor(white: 0.93, alpha: 1)
        close.configuration = configuration
        close.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .touchUpInside)
        card.addSubview(close)
        stack.addArrangedSubview(label("Loading...", size: 15, color: UIColor(white: 0.67, alpha: 1)))
        Task { [weak self, app, gallery] in
            let info = try? await app.details.info(gallery)
            guard let self else { return }
            build(info)
            view.setNeedsLayout()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = min(view.bounds.width * 0.9, 500), inner = width - 48
        let size = stack.systemLayoutSizeFitting(CGSize(width: inner, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
        let height = min(size.height + 24 + 20 + 44 + 24, view.bounds.height * 0.85)
        card.frame = CGRect(x: (view.bounds.width - width) / 2, y: (view.bounds.height - height) / 2, width: width, height: height)
        scroll.frame = CGRect(x: 24, y: 24, width: inner, height: height - 24 - 20 - 44 - 24)
        stack.frame = CGRect(x: 0, y: 0, width: inner, height: size.height)
        scroll.contentSize = stack.frame.size
        close.frame = CGRect(x: width - 24 - 96, y: height - 24 - 44, width: 96, height: 44)
    }

    @objc private func outside(_ tap: UITapGestureRecognizer) {
        if !card.frame.contains(tap.location(in: view)) { dismiss(animated: true) }
    }

    private func build(_ info: GalleryInfo?) {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard let info else {
            stack.addArrangedSubview(label("Failed to load gallery info", size: 15, color: UIColor(red: 1, green: 0.5, blue: 0.5, alpha: 1)))
            return
        }
        if !info.titleJpn.isEmpty { stack.addArrangedSubview(label(info.titleJpn, size: 19, color: UIColor(white: 0.93, alpha: 1), bold: true)) }
        stack.addArrangedSubview(label(info.title, size: 19, color: UIColor(white: 0.93, alpha: 1), bold: true))
        let language = info.language
        for (title, namespace, values) in [("Artist", "artist", info.artists), ("Group", "group", info.groups), ("Series", "series", info.parody),
                                           ("Type", "type", info.type.isEmpty ? [] : [info.type]), ("Characters", "character", info.characters),
                                           ("Language", "language", language.isEmpty ? [] : [language])] where !values.isEmpty {
            stack.addArrangedSubview(row(title, values.map { ($0, query(namespace, $0, language)) }))
        }
        stack.addArrangedSubview(row("Pages", [(String(info.pages.count), nil)]))
        if !info.date.isEmpty { stack.addArrangedSubview(row("Date", [(info.date, nil)])) }
        if !info.tags.isEmpty {
            let chips = info.tags.map { tag -> (String, String?) in
                let namespace = tag.female ? "female" : tag.male ? "male" : "tag"
                return ((tag.female ? "female:" : tag.male ? "male:" : "") + tag.tag, query(namespace, tag.tag, language))
            }
            stack.addArrangedSubview(row("Tags", []))
            stack.addArrangedSubview(ChipCloud(chips) { [weak self] query in self?.search(query) })
        }
    }

    private func query(_ namespace: String, _ value: String, _ language: String) -> String {
        app.provider.tagQuery(namespace: namespace, value: value, language: namespace == "language" ? "" : language)
    }

    private func search(_ query: String) {
        dismiss(animated: true) { [onSearch] in onSearch(query) }
    }

    private func label(_ text: String, size: CGFloat, color: UIColor, bold: Bool = false) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = bold ? .boldSystemFont(ofSize: size) : .systemFont(ofSize: size)
        label.textColor = color
        label.numberOfLines = 0
        return label
    }

    private func row(_ title: String, _ values: [(String, String?)]) -> UIView {
        let key = label(title, size: 15, color: UIColor(white: 0.53, alpha: 1))
        key.widthAnchor.constraint(equalToConstant: 84).isActive = true
        let text = UITextView()
        text.isEditable = false
        text.isScrollEnabled = false
        text.backgroundColor = .clear
        text.textContainerInset = .zero
        text.textContainer.lineFragmentPadding = 0
        text.linkTextAttributes = [.foregroundColor: UIColor(red: 0.4, green: 0.67, blue: 1, alpha: 1)]
        let value = NSMutableAttributedString()
        for (index, (display, query)) in values.enumerated() {
            if index > 0 { value.append(NSAttributedString(string: ", ", attributes: [.foregroundColor: UIColor(white: 0.93, alpha: 1)])) }
            var attributes: [NSAttributedString.Key: Any] = [.foregroundColor: UIColor(white: 0.93, alpha: 1), .font: UIFont.systemFont(ofSize: 15)]
            if let query, let url = URL(string: "search:" + (query.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")) { attributes[.link] = url }
            value.append(NSAttributedString(string: display, attributes: attributes))
        }
        text.attributedText = value
        text.delegate = LinkHandler.shared
        LinkHandler.shared.open = { [weak self] query in self?.search(query) }
        let line = UIStackView(arrangedSubviews: [key, text])
        line.spacing = 8
        line.alignment = .top
        return line
    }
}

@MainActor
final class LinkHandler: NSObject, UITextViewDelegate {
    static let shared = LinkHandler()
    var open: ((String) -> Void)?
    func textView(_ textView: UITextView, primaryActionFor textItem: UITextItem, defaultAction: UIAction) -> UIAction? {
        guard case .link(let url) = textItem.content, url.scheme == "search",
              let query = String(url.absoluteString.dropFirst("search:".count)).removingPercentEncoding else { return defaultAction }
        return UIAction { [weak self] _ in self?.open?(query) }
    }
}

// Tappable chips wrapping onto as many lines as they need.
@MainActor
final class ChipCloud: UIView {
    private let chips: [UIButton]

    init(_ items: [(String, String?)], tapped: @escaping (String) -> Void) {
        chips = items.map { display, query in
            var configuration = UIButton.Configuration.filled()
            configuration.attributedTitle = AttributedString(display, attributes: AttributeContainer([.font: UIFont.systemFont(ofSize: 14)]))
            configuration.baseBackgroundColor = UIColor(white: 0.2, alpha: 1)
            configuration.baseForegroundColor = UIColor(white: 0.87, alpha: 1)
            configuration.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8)
            configuration.cornerStyle = .fixed
            configuration.background.cornerRadius = 4
            let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in if let query { tapped(query) } })
            return button
        }
        super.init(frame: .zero)
        chips.forEach(addSubview)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    override func layoutSubviews() {
        super.layoutSubviews()
        _ = arrange(width: bounds.width, apply: true)
    }

    override func systemLayoutSizeFitting(_ target: CGSize, withHorizontalFittingPriority horizontal: UILayoutPriority, verticalFittingPriority vertical: UILayoutPriority) -> CGSize {
        CGSize(width: target.width, height: arrange(width: target.width, apply: false))
    }

    override var intrinsicContentSize: CGSize { CGSize(width: UIView.noIntrinsicMetric, height: arrange(width: bounds.width > 0 ? bounds.width : 300, apply: false)) }

    private func arrange(width: CGFloat, apply: Bool) -> CGFloat {
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for chip in chips {
            let size = chip.intrinsicContentSize
            if x + size.width > width, x > 0 { x = 0; y += rowHeight + 6; rowHeight = 0 }
            if apply { chip.frame = CGRect(x: x, y: y, width: min(size.width, width), height: size.height) }
            x += size.width + 6
            rowHeight = max(rowHeight, size.height)
        }
        return y + rowHeight
    }
}

// The first visit with the PC available: back this phone up, restore one of the PC's
// backups (which then becomes a new, independent backup), or decide later.
@MainActor
final class BackupSetupSheet: UIViewController, UIPickerViewDataSource, UIPickerViewDelegate {
    private let app: AppController
    private let backup: PCBackup
    private let choices: [BackupChoice]
    private let name = UITextField()
    private let picker = UIPickerView()
    private let summary = UILabel()

    init(app: AppController, backup: PCBackup, choices: [BackupChoice]) {
        self.app = app
        self.backup = backup
        self.choices = choices
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .formSheet
        isModalInPresentation = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(white: 0.118, alpha: 1)
        let title = UILabel()
        title.text = "Back up or restore \(app.provider.name)"
        title.font = .boldSystemFont(ofSize: 19)
        title.textColor = .white
        let local = UILabel()
        local.text = "On this phone: " + app.state.stats
        local.textColor = UIColor(white: 0.73, alpha: 1)
        local.numberOfLines = 0
        name.text = "iPhone"
        name.textColor = .white
        name.backgroundColor = UIColor(white: 0.2, alpha: 1)
        name.borderStyle = .roundedRect
        name.placeholder = "Backup name"
        let backUp = button("Back up this phone") { [weak self] in self?.finish(restore: nil) }
        picker.dataSource = self
        picker.delegate = self
        picker.isHidden = choices.isEmpty
        summary.textColor = UIColor(white: 0.73, alpha: 1)
        summary.numberOfLines = 0
        summary.text = choices.first.map { "On PC: " + $0.stats }
        let restore = button("Restore from PC") { [weak self] in
            guard let self, !choices.isEmpty else { return }
            finish(restore: choices[picker.selectedRow(inComponent: 0)])
        }
        restore.isEnabled = !choices.isEmpty
        let note = UILabel()
        note.text = "Restore replaces this phone's favorites and saved searches, then keeps them as a new, independent backup."
        note.textColor = UIColor(white: 0.53, alpha: 1)
        note.font = .systemFont(ofSize: 13)
        note.numberOfLines = 0
        let later = button("Later") { [weak self] in self?.dismiss(animated: true) }
        let stack = UIStackView(arrangedSubviews: [title, local, name, backUp, picker, summary, restore, note, later])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            picker.heightAnchor.constraint(equalToConstant: 120),
        ])
    }

    private func button(_ title: String, action: @escaping () -> Void) -> UIButton {
        var configuration = UIButton.Configuration.filled()
        configuration.title = title
        configuration.baseBackgroundColor = UIColor(white: 0.25, alpha: 1)
        return UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    }

    private func finish(restore choice: BackupChoice?) {
        let label = name.text ?? ""
        dismiss(animated: true) { [app] in app.backupChosen(label: label, restoring: choice) }
    }

    func numberOfComponents(in pickerView: UIPickerView) -> Int { 1 }
    func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int { choices.count }
    func pickerView(_ pickerView: UIPickerView, attributedTitleForRow row: Int, forComponent component: Int) -> NSAttributedString? {
        NSAttributedString(string: choices[row].label, attributes: [.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 14)])
    }
    func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) { summary.text = "On PC: " + choices[row].stats }
}

// Messages at the bottom of the screen: errors stay until tapped; other messages for a while.
@MainActor
final class Toasts {
    private var view: UILabel?

    func show(error text: String) { present(text, color: UIColor(red: 0.45, green: 0.12, blue: 0.12, alpha: 0.95), seconds: nil) }
    func show(message text: String, for seconds: TimeInterval) { present(text, color: UIColor(white: 0.2, alpha: 0.95), seconds: seconds) }

    func clearError() { view?.removeFromSuperview(); view = nil }

    private func present(_ text: String, color: UIColor, seconds: TimeInterval?) {
        guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first(where: \.isKeyWindow) else { return }
        clearError()
        let label = PaddedText()
        label.text = text
        label.numberOfLines = 0
        label.textColor = .white
        label.font = .systemFont(ofSize: 14)
        label.backgroundColor = color
        label.layer.cornerRadius = 8
        label.clipsToBounds = true
        label.isUserInteractionEnabled = true
        label.addGestureRecognizer(UITapGestureRecognizer(target: label, action: #selector(UIView.removeFromSuperview)))
        let width = window.bounds.width - 32
        let size = label.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        label.frame = CGRect(x: 16, y: window.bounds.height - window.safeAreaInsets.bottom - size.height - 16, width: width, height: size.height)
        window.addSubview(label)
        view = label
        if let seconds { DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak label] in label?.removeFromSuperview() } }
    }
}

final class PaddedText: UILabel {
    override func drawText(in rect: CGRect) { super.drawText(in: rect.insetBy(dx: 12, dy: 10)) }
    override func sizeThatFits(_ size: CGSize) -> CGSize {
        let inner = super.sizeThatFits(CGSize(width: size.width - 24, height: size.height))
        return CGSize(width: size.width, height: inner.height + 20)
    }
}
