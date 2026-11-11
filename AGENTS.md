The coding agent owns this repository: any file may be changed, including this one and README.md.

Start here:
1. [README.md](README.md): what the apps are, and the map of this repository's docs.
2. [features.md](features.md): how the apps behave; the owner relies on every flow in it.
3. [apps/ios/README.md](apps/ios/README.md): the rules, code map, providers, caching,
   build, deploy, test, inspect and gotchas.
4. [NativeKit](../../ios-tools/native/README.md): the shared Swift package (vendored as
   `apps/ios/Kit`), the rules every app keeps (the main thread only shows, relaunch to the
   exact first frame, FrameMonitor) and the simulator's limits.
5. [Mac and phone access](../../../environment/mac-access.md): SSH, the phone's UDID,
   signing.
6. [Renewal](../../ios-tools/renewal/README.md): the monthly re-signing and its build inputs.

The viewer follows the user directly: free continuous scrolling, content loading in place,
and pinch zoom of the same content. Never add snapping, automatic centering, page landing,
runways or repositioning when scrolling stops. Loading, refreshes and player reuse preserve
the visible position. Cached next chapters must append during continuous scrolling; do not
require a scroll-end or settled-page check. Explicit navigation and restoration are separate.

Build speed depends on the module split (apps/ios/README.md, "Modules"). Code that does not
need UIKit lives in the `apps/ios/Core` package module `GalleryCore`; the app target holds only
the screens. Do not move code back into the app target. What crosses modules is `public`, with
explicit `public init`s. Split a module that grows past about 3,000 lines.
