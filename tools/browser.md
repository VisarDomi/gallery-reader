# browser

## Failures

- `Failed to fetch` or `Unable to connect` when doing `page.evaluate(() => fetch(...))` — the fetch may be blocked by the page's CSP. Try using `page.evaluate` to read data already loaded by the page instead.

- `results is not defined` when `code` returns a variable defined inside `page.evaluate()` — the outer scope doesn't have it. Capture with `const result = await page.evaluate(...)` then `return result`.
- `document is not defined` when using `document` directly in `code` body — the code runs in Node context, not browser context. Use `page.evaluate()` to access the DOM.
- `window is not defined` when using `window` directly in `code` body — same issue. Use `page.evaluate()` to access browser globals.

## Passes

- Use `page.evaluate(() => { ... })` inside the `code` body to run JS in the browser context. `page` is a puppeteer Page object available in scope.
- Return pattern: `return await page.evaluate(() => { ... })` — the evaluate result IS the return value of `code`.
- For async operations inside evaluate: `return await page.evaluate(async () => { const r = await fetch(url); return r.json(); })`.
- `Unexpected identifier 'as'` / TypeScript syntax in `page.evaluate()` — `page.evaluate()` runs plain JavaScript in the browser, not TypeScript. Remove type annotations (`as any`, `: string`, etc.) from code inside `page.evaluate()` callbacks.
- `Tab "X" is not alive. Reopen it.` — the tab was closed by a prior `close` call or timed out. `open` a new tab with the same name.
