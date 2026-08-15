#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    createController,
    createSession,
    parseSelection,
    phaseBannerScript,
    runBuildSteps,
    runCaseMatrix,
    sleep,
} from "userscript-ios-test/controller";

const root = resolve(import.meta.dirname, "../..");
const iosConfig = JSON.parse(
    await readFile(resolve(root, "tests/ios/config.json"), "utf8"),
);
const phasePauseMs = Math.max(1000, Number(process.env.IOS_TEST_SETTLE_MS ?? 1000));
const clientTimeoutMs = Number(process.env.IOS_TEST_CLIENT_TIMEOUT_MS ?? 45000);
const controller = createController({
    root,
    name: iosConfig.name,
    debuggerName: iosConfig.debuggerName,
    port: iosConfig.port,
    settleMs: phasePauseMs,
    commandTimeoutMs: Number(process.env.IOS_TEST_COMMAND_TIMEOUT_MS ?? 90000),
    clientTimeoutMs,
    connectionTimeoutMs: Number(process.env.IOS_TEST_CONNECTION_TIMEOUT_MS ?? 120000),
});
const session = createSession({
    controller,
    sourceLabel: "gallery-reader.test.user.js",
});
let claimedClient = null;

const state = controller.state;
const postCommand = (_client, code) => session.postCommand(code);
const command = (_client, code, options) => session.command(code, options);

function checkAndBuild() {
    runBuildSteps(controller, [
        ["npx", ["tsc", "--noEmit"]],
        ["npx", ["vite", "build"]],
    ]);
}

function urlsMatch(actualText, expectedText) {
    try {
        const actual = new URL(actualText);
        const expected = new URL(expectedText);
        return actual.hostname === expected.hostname
            && actual.pathname === expected.pathname
            && actual.search === expected.search
            && actual.hash === expected.hash;
    } catch {
        return false;
    }
}

async function navigate(url) {
    claimedClient = await session.navigate(url);
    return claimedClient;
}

async function waitForNavigation(predicate, description) {
    claimedClient = await session.waitForNavigation(predicate, description);
    return claimedClient;
}

async function showPhase(text, stateName = "running") {
    if (!session.client) return;
    await session.showPhase({
        globalName: "__galleryReaderTestPhase",
        text,
        state: stateName,
        pauseMs: phasePauseMs,
    });
}

function injectCode(bundle, url) {
    return `
        history.replaceState(null, "", ${JSON.stringify(url)});
        ${phaseBannerScript({
            globalName: "__galleryReaderTestPhase",
            elementId: "__gallery-reader-test-phase",
        })}
        const source = ${JSON.stringify(bundle)};
        new Function(
            source + String.fromCharCode(10) + "//# sourceURL=gallery-reader.test.user.js"
        )();
        return { injectedBytes: source.length };
    `;
}

async function inject(bundle, url = claimedClient.href) {
    const previousClient = claimedClient.client;
    const commandId = await postCommand(previousClient, injectCode(bundle, url));
    const deadline = Date.now() + clientTimeoutMs;
    while (Date.now() < deadline) {
        const snapshot = await state();
        const now = Date.now() / 1000;
        const matchingClients = snapshot.clients
            .filter(client => now - client.lastSeen < 3 && urlsMatch(client.href, url))
            .sort((a, b) => b.lastSeen - a.lastSeen);
        const result = snapshot.results.find(item => item.commandId === commandId);
        if (result) {
            if (!result.ok) {
                const detail = result.error?.message ?? JSON.stringify(result.error);
                throw new Error(`Gallery injection failed: ${detail}`);
            }
            const sameClient = matchingClients.find(client => client.client === previousClient);
            if (sameClient) {
                claimedClient = sameClient;
                return;
            }
        }
        await sleep(250);
    }
    throw new Error(`Gallery takeover did not settle at ${url}`);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForGallery(expectedPage) {
    return command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i = 0; i < 360; i++) {
            const active = document.querySelector(".hs-page-active")?.textContent;
            const rows = document.querySelectorAll(".hs-row-wrap").length;
            if (active === ${JSON.stringify(String(expectedPage))} && rows > 0) break;
            await wait(250);
        }
        const active = document.querySelector(".hs-page-active")?.textContent ?? null;
        const rows = document.querySelectorAll(".hs-row-wrap").length;
        for (let i = 0; i < 120 && !document.querySelector(".hs-row .hs-thumb"); i++) {
            await wait(250);
        }
        return {
            active,
            rows,
            populatedRows: document.querySelectorAll(".hs-row").length,
            thumbs: document.querySelectorAll(".hs-thumb").length,
            pages: document.querySelectorAll(".hs-page-link").length + 1,
            href: location.href,
            input: document.getElementById("query-input")?.value ?? "",
        };
    `);
}

async function normalizePage(page) {
    const result = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const desired = ${JSON.stringify(String(page))};
        const current = document.querySelector(".hs-page-active")?.textContent;
        if (current !== desired) {
            const link = Array.from(document.querySelectorAll(".hs-page-link"))
                .find(element => element.textContent === desired);
            if (!link) return { error: "page " + desired + " link missing", current };
            link.click();
            for (let i = 0; i < 360; i++) {
                if (document.querySelector(".hs-page-active")?.textContent === desired) break;
                await wait(250);
            }
        }
        return {
            active: document.querySelector(".hs-page-active")?.textContent ?? null,
            href: location.href,
        };
    `);
    if (result.error) throw new Error(result.error);
    assert(result.active === String(page), `failed to normalize to page ${page}`);
}

async function testPagination(label) {
    await normalizePage(2);
    const result = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const run = async page => {
            const pagination = document.querySelector(".hs-page-bar-pag");
            pagination.scrollIntoView({ block: "center" });
            await wait(${phasePauseMs});
            const before = {
                historyLength: history.length,
                scrollY,
                paginationTop: pagination.getBoundingClientRect().top,
            };
            const link = Array.from(document.querySelectorAll(".hs-page-link"))
                .find(element => element.textContent === String(page));
            if (!link) return { error: "page " + page + " link missing" };
            link.click();
            for (let i = 0; i < 360; i++) {
                if (document.querySelector(".hs-page-active")?.textContent === String(page)) break;
                await wait(250);
            }
            await wait(500);
            return {
                before,
                active: document.querySelector(".hs-page-active")?.textContent ?? null,
                gridTop: document.getElementById("hs-grid")?.getBoundingClientRect().top ?? null,
                rows: document.querySelectorAll(".hs-row-wrap").length,
                href: location.href,
                historyLength: history.length,
            };
        };
        const forward = await run(3);
        const backward = await run(2);
        return { forward, backward };
    `);
    for (const [direction, step] of Object.entries(result)) {
        if (step.error) throw new Error(`${label} ${direction}: ${step.error}`);
        assert(step.active === (direction === "forward" ? "3" : "2"),
            `${label} ${direction}: wrong active page ${step.active}`);
        assert(step.rows > 0, `${label} ${direction}: no gallery rows`);
        assert(step.gridTop !== null && Math.abs(step.gridTop) <= 1,
            `${label} ${direction}: gallery top was ${step.gridTop}`);
        assert(step.historyLength === step.before.historyLength,
            `${label} ${direction}: pagination changed history length`);
    }
    await showPhase(`${label}: pagination passed`);
    return result;
}

async function testPersistedRestorePreservesGallery() {
    const result = await command(claimedClient.client, `
        const row = document.querySelector(".hs-row-wrap");
        const thumb = row?.querySelector(".hs-thumb");
        if (!row || !thumb) return { error: "gallery row unavailable" };
        const event = new Event("pageshow");
        Object.defineProperty(event, "persisted", { value: true });
        window.dispatchEvent(event);
        return {
            sameRow: document.querySelector(".hs-row-wrap") === row,
            sameThumb: document.querySelector(".hs-thumb") === thumb,
        };
    `);
    if (result.error) throw new Error(result.error);
    assert(result.sameRow && result.sameThumb,
        "persisted pageshow rebuilt the cached gallery DOM");
    await showPhase("Hitomi Favorites: persisted restore preserves gallery DOM");
}

async function snapshotLocalStorage() {
    return command(claimedClient.client, `
        const keys = ["saved_searches", "favorites", "gallery-reader-favorites-v1", "scroll-pos-/"];
        return Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
    `);
}

async function restoreLocalStorage(snapshot) {
    if (!claimedClient) return;
    await command(claimedClient.client, `
        const snapshot = ${JSON.stringify(snapshot)};
        for (const [key, value] of Object.entries(snapshot)) {
            if (value === null) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        }
        return true;
    `);
}

async function testFavoriteToggle() {
    const before = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i = 0; i < 120 && !document.querySelector(".hs-row"); i++) await wait(250);
        const row = document.querySelector(".hs-row-wrap");
        const button = row?.querySelector(".row-action-btn:not(.info-btn)");
        const image = row?.querySelector(".hs-thumb");
        if (!row || !button || !image) return { error: "favorite test row unavailable" };
        const gidMatch = image.onclick?.toString().match(/readerUrl\\((\\d+)/);
        const original = button.textContent;
        button.click();
        for (let i = 0; i < 40 && button.textContent === original; i++) await wait(100);
        const toggled = button.textContent;
        button.click();
        for (let i = 0; i < 40 && button.textContent !== original; i++) await wait(100);
        return {
            original,
            toggled,
            restored: button.textContent,
            rowConnected: row.isConnected,
            gidHint: gidMatch?.[1] ?? null,
        };
    `);
    if (before.error) throw new Error(before.error);
    assert(before.original !== before.toggled, "favorite button did not change");
    assert(before.restored === before.original, "favorite button did not restore");
    assert(before.rowConnected, "favorite toggle disturbed its row");
    await showPhase("Favorite toggle passed and was restored");
}

async function testBasicModal() {
    const result = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const info = document.querySelector(".info-btn");
        if (!info) return { error: "info button missing" };
        info.click();
        for (let i = 0; i < 240 && !document.querySelector(".hs-modal-ok-btn"); i++) {
            await wait(250);
        }
        const modal = document.querySelector(".hs-modal-backdrop");
        const metadata = {
            rows: modal?.querySelectorAll(".hs-modal-row").length ?? 0,
            links: modal?.querySelectorAll(".hs-modal-value-link,.hs-tag-chip").length ?? 0,
        };
        modal?.querySelector(".hs-modal-ok-btn")?.click();
        const closedByButton = !document.querySelector(".hs-modal-backdrop");
        info.click();
        for (let i = 0; i < 240 && !document.querySelector(".hs-modal-ok-btn"); i++) {
            await wait(250);
        }
        const backdrop = document.querySelector(".hs-modal-backdrop");
        backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return {
            metadata,
            closedByButton,
            closedByBackdrop: !document.querySelector(".hs-modal-backdrop"),
        };
    `);
    if (result.error) throw new Error(result.error);
    assert(result.metadata.rows > 0, "information modal has no metadata");
    assert(result.metadata.links > 0, "information modal has no related-search links");
    assert(result.closedByButton, "modal Close button failed");
    assert(result.closedByBackdrop, "modal backdrop failed");
    await showPhase("Gallery information modal passed");
}

async function testSearchState(expectedQuery) {
    const result = await command(claimedClient.client, `
        const searches = JSON.parse(localStorage.getItem("saved_searches") || "[]");
        const entry = searches.find(item => item.query === ${JSON.stringify(expectedQuery)});
        const chip = Array.from(document.querySelectorAll(".hs-saved-chip"))
            .find(item => item.firstElementChild?.textContent === ${JSON.stringify(expectedQuery)});
        return {
            entry: entry ?? null,
            chip: Boolean(chip),
            input: document.getElementById("query-input")?.value ?? null,
        };
    `);
    assert(result.entry, `search was not saved for query ${expectedQuery}`);
    assert(result.entry.page === 2, `saved search page was ${result.entry.page}, expected 2`);
    assert(result.chip, "saved-search chip missing");
    assert(result.input === expectedQuery, "search input does not match URL query");
    await showPhase("Saved search and input state passed");
}

async function testReaderFlow(bundle, searchUrl, providerName) {
    await normalizePage(2);
    const searchPosition = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i = 0; i < 120 && document.querySelectorAll(".hs-row").length < 4; i++) {
            await wait(250);
        }
        const row = document.querySelectorAll(".hs-row-wrap")[3];
        row?.scrollIntoView();
        await wait(500);
        const image = row?.querySelectorAll(".hs-thumb")[2] ?? row?.querySelector(".hs-thumb");
        globalThis.__galleryReaderBfcacheProbe = {
            row,
            image,
            persisted: false,
        };
        window.addEventListener("pageshow", event => {
            globalThis.__galleryReaderBfcacheProbe.persisted = event.persisted;
        }, { once: true });
        return {
            available: Boolean(image),
            imageIndex: image ? Array.from(image.parentElement.children).indexOf(image) : -1,
            scrollY,
            href: location.href,
        };
    `);
    assert(searchPosition.available, `${providerName}: reader thumbnail unavailable`);
    await command(claimedClient.client, `
        const row = document.querySelectorAll(".hs-row-wrap")[3];
        const image = row?.querySelectorAll(".hs-thumb")[2] ?? row?.querySelector(".hs-thumb");
        image.click();
        return "navigating";
    `, { expectResult: false });
    await waitForNavigation(
        client => {
            const path = new URL(client.href).pathname;
            return providerName === "hitomi" ? path.startsWith("/reader/") : path.startsWith("/view/");
        },
        `${providerName} reader`,
    );
    const initialReaderUrl = claimedClient.href;
    await inject(bundle, initialReaderUrl);
    const reader = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const expected = ${searchPosition.imageIndex};
        for (let i = 0; i < 360 && !document.getElementById("#" + expected); i++) await wait(250);
        const images = document.querySelectorAll(".hs-reader-img");
        const target = document.getElementById("#" + expected);
        return {
            bodies: document.querySelectorAll(".hs-reader-body").length,
            images: images.length,
            targetTop: target?.getBoundingClientRect().top ?? null,
            expectedTop: innerHeight / 2,
            skeleton: Boolean(target?.style.aspectRatio),
        };
    `);
    assert(reader.bodies === 1 && reader.images > 1, `${providerName}: reader did not render`);
    assert(reader.skeleton, `${providerName}: reader aspect-ratio skeleton missing`);
    assert(Math.abs(reader.targetTop - reader.expectedTop) <= 2,
        `${providerName}: selected image restored at ${reader.targetTop}, expected ${reader.expectedTop}`);

    const saved = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const images = Array.from(document.querySelectorAll(".hs-reader-img"));
        const current = ${searchPosition.imageIndex};
        const target = images[Math.min(current + 1, images.length - 1)];
        for (let i = 0; i < 360 && !(target.complete && target.naturalWidth > 0); i++) await wait(250);
        const before = location.href;
        scrollTo(0, target.offsetTop - innerHeight / 2 + 1);
        for (let i = 0; i < 80 && location.href === before; i++) await wait(100);
        return {
            before,
            href: location.href,
            id: target.id,
            loaded: target.complete && target.naturalWidth > 0,
        };
    `);
    assert(saved.loaded, `${providerName}: reader target image did not load`);
    assert(saved.href !== saved.before, `${providerName}: reader URL did not save on scroll`);

    claimedClient = await session.reload(saved.href, {
        matches: (client, expected) => urlsMatch(client.href, expected),
    });
    await inject(bundle, saved.href);
    const restored = await command(claimedClient.client, `
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i = 0; i < 360 && !document.getElementById(${JSON.stringify(saved.id)}); i++) {
            await wait(250);
        }
        const image = document.getElementById(${JSON.stringify(saved.id)});
        return {
            top: image?.getBoundingClientRect().top ?? null,
            expectedTop: innerHeight / 2,
            href: location.href,
        };
    `);
    assert(Math.abs(restored.top - restored.expectedTop) <= 2,
        `${providerName}: saved reader restored at ${restored.top}, expected ${restored.expectedTop}`);

    await command(claimedClient.client, `history.back(); return "back";`, { expectResult: false });
    await waitForNavigation(client => {
        const actual = new URL(client.href);
        const expected = new URL(searchUrl);
        return actual.hostname === expected.hostname
            && actual.pathname === expected.pathname
            && actual.search === expected.search
            && actual.hash === expected.hash;
    }, `${providerName} Back to search`);
    const returnState = await command(claimedClient.client, `
        const probe = globalThis.__galleryReaderBfcacheProbe;
        return {
            hasApp: Boolean(document.getElementById("hs-grid")),
            persisted: probe?.persisted === true,
            sameRow: probe?.row === document.querySelectorAll(".hs-row-wrap")[3],
            sameImage: probe?.image?.isConnected === true,
        };
    `);
    if (providerName === "hitomi") {
        assert(returnState.hasApp, "hitomi: Back reloaded instead of restoring the app from bfcache");
        assert(returnState.persisted, "hitomi: Back did not fire a persisted pageshow");
        assert(returnState.sameRow && returnState.sameImage,
            "hitomi: Back rebuilt the gallery instead of preserving its cached DOM");
    } else if (!returnState.hasApp) {
        await inject(bundle, searchUrl);
    }
    const returned = await waitForGallery(2);
    assert(returned.active === "2", `${providerName}: Back restored page ${returned.active}`);
    const scroll = await command(claimedClient.client, `return { scrollY };`);
    assert(Math.abs(scroll.scrollY - searchPosition.scrollY) <= 2,
        `${providerName}: Back restored scroll ${scroll.scrollY}, expected ${searchPosition.scrollY}`);
    await showPhase(`${providerName}: reader save, reload, and Back passed`);
}

function extractEntryUrls(text) {
    const urls = [...text.matchAll(/^https?:\/\/\S+$/gm)].map(match => match[0]);
    const favorites = urls.find(url => new URL(url).hostname === "hitomi.la"
        && new URL(url).pathname === "/");
    const hitomiSearch = urls.find(url => new URL(url).hostname === "hitomi.la"
        && new URL(url).pathname !== "/");
    const imhentaiSearch = urls.find(url => new URL(url).hostname === "imhentai.xxx");
    if (!favorites || !hitomiSearch || !imhentaiSearch) {
        throw new Error("test.txt must contain Hitomi Favorites, Hitomi Search, and imhentai Search URLs");
    }
    return { favorites, hitomiSearch, imhentaiSearch };
}

function hitomiQuery(url) {
    return decodeURIComponent(new URL(url).search.slice(1));
}

function imhentaiQuery(url) {
    const parsed = new URL(url);
    const key = parsed.searchParams.get("key") ?? "";
    const languages = {
        jp: "japanese", en: "english", es: "spanish", fr: "french",
        kr: "korean", de: "german", ru: "russian",
    };
    const enabled = Object.entries(languages).filter(([code]) => parsed.searchParams.get(code) === "1");
    return enabled.length === 1
        ? (key ? `${key},language:${enabled[0][1]}` : `language:${enabled[0][1]}`)
        : key;
}

async function runFavorites(bundle, url) {
    await navigate(url);
    const backup = await snapshotLocalStorage();
    try {
        await inject(bundle, url);
        const gallery = await waitForGallery(Number(backup.favorites) || 1);
        assert(gallery.pages >= 3,
            `Favorites require at least 3 pages; phone has ${gallery.pages}`);
        assert(gallery.rows > 0 && gallery.thumbs > 0, "Favorites did not populate gallery rows");
        await showPhase(`Hitomi Favorites: ${gallery.pages} pages ready`);
        await testPagination("Hitomi Favorites");
        await testPersistedRestorePreservesGallery();
    } finally {
        await restoreLocalStorage(backup);
    }
}

async function runSearch(bundle, url, providerName) {
    await navigate(url);
    const backup = await snapshotLocalStorage();
    try {
        await inject(bundle, url);
        const query = providerName === "hitomi" ? hitomiQuery(url) : imhentaiQuery(url);
        const gallery = await waitForGallery(2);
        assert(gallery.active === "2", `${providerName}: initial page was ${gallery.active}`);
        assert(gallery.rows > 0 && gallery.populatedRows > 0 && gallery.thumbs > 0,
            `${providerName}: gallery rows did not populate`);
        await showPhase(`${providerName}: gallery rendering passed`);
        await testPagination(`${providerName} Search`);
        await testSearchState(query);
        await testBasicModal();
        await testFavoriteToggle();
        await testReaderFlow(bundle, url, providerName);
    } finally {
        await restoreLocalStorage(backup);
    }
}

async function main() {
    const selection = parseSelection(process.argv.slice(2), {
        defaultTest: process.argv.includes("--smoke") ? "favorites" : "full",
    });
    if (selection.args.some(argument => argument !== "--smoke")) {
        throw new Error(`Unknown test arguments: ${selection.args.join(" ")}`);
    }
    if (!["full", "favorites", "search"].includes(selection.test)) {
        throw new Error(`Unknown test "${selection.test}". Expected full, favorites, or search.`);
    }
    if (selection.site && !["hitomi", "imhentai"].includes(selection.site)) {
        throw new Error(`Unknown site "${selection.site}". Expected hitomi or imhentai.`);
    }

    const contract = await readFile(resolve(root, "test.txt"), "utf8");
    const urls = extractEntryUrls(contract);
    claimedClient = await session.connect({
        allowedHosts: Object.values(urls).map(url => new URL(url).hostname),
        controlledCode: `
            return Boolean(
                globalThis.__galleryReaderTestPhase ||
                document.getElementById("hs-grid") ||
                document.querySelector(".hs-reader-body")
            );
        `,
    });
    checkAndBuild();
    const bundle = await readFile(resolve(root, "dist/gallery-reader.user.js"), "utf8");
    const allCases = [
        { name: "Hitomi Favorites", test: "favorites", site: "hitomi", run: () => runFavorites(bundle, urls.favorites) },
        { name: "Hitomi Search", test: "search", site: "hitomi", run: () => runSearch(bundle, urls.hitomiSearch, "hitomi") },
        { name: "imhentai Search", test: "search", site: "imhentai", run: () => runSearch(bundle, urls.imhentaiSearch, "imhentai") },
    ];
    const cases = allCases.filter(testCase =>
        (selection.test === "full" || testCase.test === selection.test) &&
        (!selection.site || testCase.site === selection.site)
    );
    if (!cases.length) throw new Error("The selected test/site combination has no cases.");
    if (selection.test === "favorites") {
        console.log("Favorites mode: running Hitomi Favorites only.");
    }
    const { failures } = await runCaseMatrix({
        cases,
        pauseMs: phasePauseMs,
        run: testCase => testCase.run(),
        onFailure: async ({ testCase, message }) => {
            try {
                await showPhase(`${testCase.name} FAILED: ${message}`, "error");
            } catch {
                // Navigation failure may leave no controllable page.
            }
        },
    });
    if (failures.length) {
        console.error(`\n${failures.length}/${cases.length} gallery iOS cases failed.`);
        for (const failure of failures) {
            console.error(`- ${failure.testCase.name}: ${failure.message}`);
        }
        process.exitCode = 1;
    } else {
        await showPhase("ALL GALLERY TESTS SUCCESSFUL", "success");
        console.log("\nAll gallery iOS cases passed.");
    }
}

try {
    await main();
} catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    await session.cleanup();
    session.close();
}
