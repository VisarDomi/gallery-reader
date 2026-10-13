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
