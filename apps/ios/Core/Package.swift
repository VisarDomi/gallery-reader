// swift-tools-version: 6.2
import PackageDescription

// The app's logic as its own module, so a release build optimizes it apart from the screens and
// an edit recompiles only its own module, not the whole app. GalleryReader/ holds only the UIKit
// screens. Keep new logic here: see apps/ios/README.md ("Modules").
let package = Package(
    name: "GalleryCore",
    platforms: [.iOS(.v26), .macOS(.v15)],
    products: [.library(name: "GalleryCore", targets: ["GalleryCore"])],
    dependencies: [.package(path: "../Kit")],
    targets: [
        // The sites, the image and search caches, transfers and prefetching.
        .target(name: "GalleryCore", dependencies: [
            .product(name: "KitCore", package: "Kit"),
            .product(name: "KitNet", package: "Kit"),
            .product(name: "KitImages", package: "Kit"),
        ]),
    ]
)
