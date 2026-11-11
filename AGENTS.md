# Gallery Reader

Agent owns repo. Read README.md, features.md and apps/ios/README.md before edits;
shared NativeKit: ../../ios-tools/native/README.md; access:
../../../environment/mac-access.md; signing: ../../ios-tools/renewal/README.md.

Preserve continuous scroll/pinch and visible position through loading/refresh/reuse.
Append cached chapters while scrolling; no snapping, centering, runways, automatic
corrections or settled-page gates. Explicit navigation/restoration are separate.
Reserve exact image geometry before publishing; fill in place with bounded retries.
Prioritize visible/near-visible decode; loading never waits for scroll-end.

Measure bounded provider status/rate/concurrency before tuning; distinguish
throttling, transport, decode and main-thread costs. Enforce measured limits/backoff.
Children inherit acceptance/device limits. Build/desktop tests do not prove phone fluidity.
- Build speed: keep the module split (apps/ios/README.md "Modules"). Non-UI code goes in
  apps/ios/Core (GalleryCore), never back into the app target. Cross-module API is public
  with explicit inits; split a module past ~3,000 lines.
