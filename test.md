## iOS Safari regression tests

The repository contains its own remote debugger and phone test runner. The
frozen behavior and target URLs are defined in [`test.txt`](test.txt). The
automated suite exercises Hitomi Favorites, Hitomi Search, and imhentai Search,
including gallery rendering, pagination, search state, gallery information,
Favorites toggling, reader position, reload restoration, and Back navigation.

The suite uses the tester's existing Hitomi Favorites as read-only test data.
The phone must have at least 51 Favorites so the list contains at least three
pages at 25 galleries per page. The runner temporarily changes some local UI
state and restores it after each case.

One-time setup on a new development machine:

```bash
npm install
```

The shared `userscript-ios-test` package builds one debugger userscript for all
userscript repositories. Set `IOS_DEBUG_HOST` only when automatic LAN-address
detection is not correct, then rebuild and reinstall that shared debugger.

Generate and trust the HTTPS certificate by following
[`certificate.md`](certificate.md). With `npm run tests:server` still running:

1. Install
   [`userscript-ios-test-debug.user.js`](../../userscript-ios-test/dist/userscript-ios-test-debug.user.js),
   or open `https://192.168.1.197:37777/userscript-ios-test-debug.user.js`
   while the bridge is running.
2. Install it in the iOS userscript manager.
3. Give the debugger permission to run on all tested websites.
4. Enable `userscript-ios-test-debug` and disable the normal gallery-reader
   userscript. The test runner injects the freshly built app itself.
5. Keep Safari unlocked and foregrounded. Temporarily set display auto-lock to
   **Never**, then restore the original setting after testing.

### Running the tests

Before starting, show `https://example.com/` or one of the frozen target sites
in the foreground Safari tab. The runner refuses to claim an unrelated tab. A
normal run ends by navigating the controlled tab back to
`https://example.com/`, including after a test failure.

Run the small Favorites smoke case first when validating a new setup:

```bash
npm run tests:smoke
```

Run the complete suite with:

```bash
npm run tests
```

Select one behavior and/or site:

```bash
npm run tests -- --test favorites --site hitomi
npm run tests -- --test search --site imhentai
```

The test command:

- type-checks with `npx tsc --noEmit`;
- builds the current bundle without incrementing the production version;
- starts the repository-local bridge when one is not already running;
- injects the current bundle at the start of every tested home, search, and
  reader route, including after real navigation and reload;
- reads the three entry URLs from `test.txt`;
- pauses for at least one second between visible phases and sites;
- reports each case independently and continues to later cases after a failure;
- restores the local state it snapshots and returns Safari to `example.com`.

If a run appears stuck, inspect the phone before stopping it. Reader and network
operations have bounded waits, and the phase banner shows the most recent
completed action. A stopped run may leave Safari on the current target; return
it to `example.com` before restarting.

### Configuration

- `IOS_DEBUG_ORIGIN` — local controller origin, default
  `https://127.0.0.1:37777`. If overridden, the userscript and bridge port must
  be edited to match.
- `IOS_DEBUG_HOST` — address used for certificate generation and printed setup
  URLs only; it does not rewrite the userscript.
- `tests/ios/config.json` — repository identity used by the shared harness.
- `IOS_DEBUG_CERT` / `IOS_DEBUG_KEY` — custom HTTPS certificate paths.
- `IOS_DEBUG_CA` — custom public root CA path for `/api/cert`.
- `IOS_TEST_SETTLE_MS` — delay between visible phases, clamped to at least
  `1000`.
- `IOS_TEST_COMMAND_TIMEOUT_MS` — remote-command timeout, default `90000`.
- `IOS_TEST_CLIENT_TIMEOUT_MS` — navigation/client timeout, default `45000`.
- `IOS_TEST_CONNECTION_TIMEOUT_MS` — initial debugger wait, default `120000`.
