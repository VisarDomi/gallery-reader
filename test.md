## iOS Safari regression tests

The frozen behavior and target URLs are defined in [`test.txt`](test.txt). The
automated suite exercises Hitomi Favorites, Hitomi Search, and imhentai Search,
including gallery rendering, pagination, search state, gallery information,
Favorites toggling, reader position, reload restoration, and Back navigation.

The suite uses the tester's existing Hitomi Favorites as read-only test data.
The phone must have at least 51 Favorites so the list contains at least three
pages at 25 galleries per page. The runner temporarily changes some local UI
state and restores it after each case.

Install the repository dependencies once:

```bash
npm install
```

Phone-harness setup is documented by
[`userscript-ios-test`](../../userscript-ios-test/README.md). Disable the normal
gallery-reader userscript because the test runner injects the freshly built app
itself. Keep Safari unlocked and foregrounded while a run is active.

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
