// Reader/image lifecycle ported from gallery-downloader ff4dcbf; see PORT.md.
import * as online from './online';
import { registerImage } from '../../../src/core/image-retry';
import { onSettledScroll } from '../../../src/core/scroll-settle';
online.setup();
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const readerKey = /^(hitomi|imhentai)-[1-9]\d*$/.test(params.get('read') || '') ? params.get('read') : null;

const readUrl = (key, index) => `/?read=${key}&page=${index + 1}`;
let worker, rpcId = 0, catalog = [], suspended = false;
let gridVersion = '', renderedReader = false, openingReader = false, observer, rowObserver;
const pending = new Map(), rows = new Map(), slots = new Set();
const say = text => { $('status').textContent = text; };
const mark = (label, ms = Math.round(performance.now())) => window.bootMarks.push({ label, ms });
mark('App module');

// Persistent positions are logical anchors; WebKit still owns live history,
// gestures, zoom, and bfcache restoration.
let savedPosition = null, positionReady = false, skipPositionSave = false;
let heldAnchor, anchorFrame, restoreCancelled = false;
const focalY = () => (window.visualViewport?.offsetTop || 0) + (window.visualViewport?.height || innerHeight) / 2;
function capturePosition() {
    const center = focalY();
    const candidates = readerKey ? [...slots] : [...rows.values()];
    let anchor = candidates.find(node => {
        const rect = node.getBoundingClientRect(); return rect.top <= center && rect.bottom > center;
    });
    if (!anchor && readerKey && candidates.length) {
        anchor = center < candidates[0].getBoundingClientRect().top ? candidates[0] : candidates.at(-1);
    }
    const rect = anchor?.getBoundingClientRect();
    const strips = { ...(savedPosition?.strips || {}) };
    if (!readerKey) for (const [key, row] of rows) {
        const strip = row.querySelector('.hs-row'); if (strip) strips[key] = strip.scrollLeft;
    }
    const page = readerKey && anchor ? anchor.index : null;
    if (page !== null) history.replaceState(null, '', readUrl(readerKey, page));
    return { path: location.pathname + location.search, anchor: readerKey ? null : anchor?.galleryItem.key || null,
        page, fraction: rect ? Math.max(0, Math.min(1, (center - rect.top) / rect.height)) : 0,
        y: Math.max(0, scrollY), strips: readerKey ? {} : strips };
}
function savePosition() {
    if (!positionReady || suspended || skipPositionSave) return Promise.resolve();
    const position = capturePosition();
    return window.nativeGallery?.savePosition(position) || Promise.resolve();
}
const schedulePositionSave = onSettledScroll(() => { void savePosition(); });
function alignAnchor() {
    if (!heldAnchor?.node.isConnected) return;
    const rect = heldAnchor.node.getBoundingClientRect();
    const y = scrollY + rect.top + rect.height * heldAnchor.fraction - focalY();
    if (Math.abs(y - scrollY) > 0.5) scrollTo(0, Math.max(0, y));
}
function restorePosition() {
    if (positionReady) return;
    if (savedPosition && !restoreCancelled) {
        const node = readerKey ? $(`page-${(savedPosition.page ?? 0) + 1}`) : rows.get(savedPosition.anchor);
        if (node) { heldAnchor = { node, fraction: savedPosition.fraction }; alignAnchor(); }
        else scrollTo(0, savedPosition.y);
    }
    positionReady = true;
    requestAnimationFrame(() => { alignAnchor(); schedulePositionSave(); });
}
window.galleryViewState = {
    receive(position, skipSaving) {
        skipPositionSave = skipSaving;
        if (positionReady) return; // Existing bfcache document already has its exact position.
        if (position && (!readerKey || position.path === location.pathname + location.search)) savedPosition = position;
    },
    save: savePosition
};
const positionResize = new ResizeObserver(() => {
    if (!heldAnchor) return;
    cancelAnimationFrame(anchorFrame); anchorFrame = requestAnimationFrame(alignAnchor);
});
positionResize.observe($('reader-pages'));
for (const type of ['touchstart', 'pointerdown', 'wheel', 'keydown']) {
    addEventListener(type, () => { restoreCancelled = true; heldAnchor = null; cancelAnimationFrame(anchorFrame); }, { passive: true, capture: true });
}
// Horizontal strips do not bubble scrollend to window. Save their native checkpoint at their own end.
addEventListener('scrollend', event => { if (event.target instanceof Element) void savePosition(); }, { passive: true, capture: true });
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void savePosition(); });
addEventListener('click', event => { if (event.target.closest?.('a[href]')) void savePosition(); }, { capture: true });

function call(command, args) {
    if (!worker || suspended) return Promise.reject(new Error('App suspended'));
    return new Promise((resolve, reject) => {
        const id = ++rpcId; pending.set(id, { resolve, reject });
        worker.postMessage({ id, command, args });
    });
}
function totals() {
    $('count').textContent = `~${online.pageState.total}${online.query === null ? ' Favorites' : ' Results'}`;
}
function release(slot) {
    slot.token = (slot.token || 0) + 1; slot.loading = false;
    if (slot.url) URL.revokeObjectURL(slot.url);
    slot.url = undefined;
    const img = slot.querySelector('img');
    if (img) { img.onload = img.onerror = null; img.removeAttribute('src'); }
}
// Bound concurrent blobs/network previews, including horizontal strip scrolling.
const work = [], backgroundWork = []; let working = 0, backgroundScheduled = false;
function enqueue(task, background = false) {
    (background ? backgroundWork : work).push(task); pump();
}
function continueBackground() {
    if (backgroundScheduled || suspended || !backgroundWork.length) return;
    backgroundScheduled = true;
    setTimeout(() => {
        backgroundScheduled = false;
        if (!suspended && !work.length && working < 2 && backgroundWork.length) {
            working++;
            Promise.resolve().then(backgroundWork.shift()).catch(() => {}).finally(() => { working--; pump(); });
        }
        continueBackground();
    }, 16);
}
function pump() {
    while (working < 6 && work.length && !suspended) {
        working++; Promise.resolve().then(work.shift()).catch(() => {}).finally(() => { working--; pump(); });
    }
    continueBackground();
}
function pageError(slot, text) {
    let error = slot.querySelector('.page-error');
    if (!error) { error = document.createElement('span'); error.className = 'page-error'; slot.append(error); }
    error.textContent = `Page ${slot.index + 1}: ${text}`;
}
async function loadImage(slot) {
    if (!slot.visible || slot.loading || slot.url || suspended) return;
    const token = slot.token = (slot.token || 0) + 1;
    slot.loading = true;
    const img = slot.querySelector('img');
    try {
        const {url} = await call(readerKey ? 'page' : 'thumbnail', {
            key: readerKey || slot.key, index: slot.index
        });
        if (token !== slot.token || suspended || !slot.isConnected) return;
        slot.url = url;
        img.onload = () => {
            if (!window.bootMarks.some(mark => mark.label === 'First image loaded')) {
                mark('First image loaded');
                window.nativeGallery?.reportStartup(window.bootMarks);
            }
            if (readerKey && token === slot.token) {
                slot.style.aspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
                slot.querySelector('.page-error')?.remove();
            }
        };
        img.onerror = () => {
            if (token !== slot.token) return;
            if (readerKey) pageError(slot, 'Image could not be loaded.');
        };
        img.src = slot.url;
        registerImage(img);
    } catch (error) {
        if (token === slot.token && !suspended) {
            if (readerKey) pageError(slot, error.message);
            else img.alt = `${slot.index + 1} · ${error.message}`;
        }
    } finally { if (token === slot.token) slot.loading = false; }
}
function observeImages() {
    observer?.disconnect();
    observer = new IntersectionObserver(entries => {
        for (const { target: slot, isIntersecting } of entries) {
            slot.visible = isIntersecting;
            if (isIntersecting) enqueue(() => loadImage(slot)); else release(slot);
        }
    }, { rootMargin: readerKey ? '1000px 0px' : '300px 0px' });
    for (const slot of slots) observer.observe(slot);
    rowObserver?.disconnect();
    rowObserver = new IntersectionObserver(entries => {
        for (const { target: row, isIntersecting } of entries) {
            if (isIntersecting) enqueue(() => populateRow(row, row.galleryItem));
        }
    }, { rootMargin: '600px 0px' });
    for (const row of rows.values()) rowObserver.observe(row);
}
async function populateRow(row, item) {
    if (!row || row.populating || row.details) return;
    row.populating = true;
    try {
        const data = await call('describe', { key: item.key });
        if (!row.isConnected || suspended) return;
        const strip = document.createElement('div'); strip.className = 'hs-row';
        for (let index = 0; index < data.manifest.pages.length; index++) {
            const link = document.createElement('a'), img = new Image();
            link.className = 'thumb-link'; link.href = readUrl(item.key, index);
            link.setAttribute('aria-label', `${item.title} · page ${index + 1}`);
            img.className = 'hs-thumb'; img.alt = ''; img.decoding = 'async';
            link.key = item.key; link.index = index;
            link.source = data.manifest.thumbnails?.pages[index]?.url;
            link.append(img); strip.append(link);
            if (index % 32 === 31) {
                await new Promise(resolve => setTimeout(resolve, 0));
                if (!row.isConnected || suspended) return;
            }
        }
        row.details = data; row.querySelector('.row-message')?.remove(); row.prepend(strip);
        if (savedPosition?.strips?.[item.key]) strip.scrollLeft = savedPosition.strips[item.key];
        for (const slot of strip.children) { slots.add(slot); observer.observe(slot); }
    } catch (error) {
        if (!suspended && row.isConnected) row.querySelector('.row-message').textContent = `Gallery ${item.id}: ${error.message}`;
    } finally { row.populating = false; }
}
function renderCatalog() {
    totals();
    if (readerKey) return;
    const signature = JSON.stringify([online.pageState.current, online.pageState.total, online.pageState.size, catalog.map(i => [i.key, i.title, i.ready])]);
    if (signature === gridVersion) return; // Keep DOM/strip scroll when returning through bfcache.
    gridVersion = signature; say(''); observer?.disconnect();
    for (const slot of slots) release(slot);
    slots.clear(); rows.clear();
    const fragment = document.createDocumentFragment();
    const totalPages = Math.max(1, Math.ceil(online.pageState.total / online.pageState.size)), current = online.pageState.current;
    const items = catalog;
    for (const item of items) {
        const row = document.createElement('div'); row.className = 'hs-row-wrap'; row.galleryItem = item;
        const message = document.createElement('p'); message.className = 'row-message';
        const link = document.createElement('a'); link.href = readUrl(item.key, 0); link.textContent = item.title; message.append(link);
        const overlay = document.createElement('div'); overlay.className = 'row-title-overlay';
        void online.actions(item).then(actions => { if (row.isConnected) overlay.append(actions); }).catch(console.error);
        row.append(message, overlay); rows.set(item.key, row); fragment.append(row);
    }
    $('hs-grid').replaceChildren(fragment);
    const pagination = document.createDocumentFragment(), favs = document.createElement('a');
    favs.href = '/'; favs.className = 'hs-page-favs'; favs.textContent = 'Favs'; pagination.append(favs);
    for (let page = 1; page <= totalPages; page++) {
        const link = document.createElement('span'); link.textContent = page;
        if (page !== current) link.onclick = () => { void online.paginate(page).then(() => $('hs-grid').scrollIntoView()).catch(error => say(error.message)); };
        link.className = page === current ? 'hs-page-active' : 'hs-page-link';
        if (page === current) link.setAttribute('aria-current', 'page'); pagination.append(link);
    }
    $('pagination').replaceChildren(pagination);
    restorePosition(); observeImages();
    mark('Catalog rows rendered');
    for (const item of items) enqueue(() => populateRow(rows.get(item.key), item), true);
}
async function openReader() {
    if (openingReader) return;
    openingReader = true;
    $('library').hidden = $('library-footer').hidden = true; $('reader').hidden = false;
    if (!renderedReader) $('reader-message').textContent = 'Loading…';
    try {
        const { manifest } = await call('open', { key: readerKey });
        if (suspended) return;
        document.title = manifest.title;
        $('reader-message').textContent = manifest.pages.length ? '' : 'This gallery has no readable images.';
        if (!renderedReader) {
            const fragment = document.createDocumentFragment();
            const available = manifest.pages.length;
            for (let index = 0; index < available; index++) {
                const page = manifest.pages[index];
                const slot = document.createElement('div'), img = new Image();
                slot.className = 'page'; slot.index = index; slot.id = `page-${index + 1}`;
                slot.style.aspectRatio = page.width > 0 && page.height > 0 ? `${page.width}/${page.height}` : '2/3';
                img.className = 'hs-reader-img'; img.alt = ''; img.decoding = 'async';
                slot.append(img); fragment.append(slot);
                if (index % 32 === 31) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    if (suspended) return;
                }
            }
            $('reader-pages').replaceChildren(fragment);
            for (const slot of $('reader-pages').children) slots.add(slot);
            renderedReader = true;
            const selected = Math.max(0, Math.min(available - 1, Math.floor(Number(params.get('page')) || 1) - 1));
            const target = $(`page-${selected + 1}`);
            if (target && !savedPosition && !restoreCancelled) window.scrollTo(0, Math.max(0, target.offsetTop - window.innerHeight / 2));
            restorePosition();
        }
        observeImages();
    } catch (error) { $('reader-message').textContent = error.message; }
    finally { openingReader = false; }
}
async function start(restoring = false) {
    suspended = false; mark(restoring ? 'bfcache resumed' : 'UI yielded a paint');
    worker = window.nativeGallery.createWorker();
    worker.onerror = error => {
        for (const request of pending.values()) request.reject(new Error(error.message)); pending.clear();
        totals(); say(`Storage error: ${error.message}`);
    };
    worker.onmessage = ({ data }) => {
        if ('id' in data) {
            const request = pending.get(data.id); pending.delete(data.id);
            if (data.error) request?.reject(new Error(data.error)); else request?.resolve(data.result); return;
        }
        if (data.type === 'timing') mark(data.label, data.ms);
        if (data.type === 'notice') say(data.message);
        if (data.type === 'catalog') {
            catalog = data.catalog.items;
            renderCatalog();
        }

    };
    try {
        await call('init'); totals();
        if (readerKey) await openReader();
        else if (restoring) {
            observeImages();
            for (const row of rows.values()) enqueue(() => populateRow(row, row.galleryItem), true);
            pump(); schedulePositionSave();
        }
    } catch (error) { if (readerKey) $('reader-message').textContent = error.message; else say(error.message); }
    requestAnimationFrame(() => requestAnimationFrame(() => window.nativeGallery?.continueLoading()));
}
window.addEventListener('pagehide', () => {
    void savePosition();
    suspended = true; worker?.terminate(); worker = undefined;
    observer?.disconnect(); rowObserver?.disconnect(); work.length = 0; backgroundWork.length = 0;
    // Keep DOM, dimensions, blob URLs and both scroll axes for bfcache. Release
    // IDB/write handles by terminating the worker, without blocking navigation.
    for (const slot of slots) { slot.token = (slot.token || 0) + 1; slot.loading = false; }
    for (const request of pending.values()) request.reject(new Error('App suspended')); pending.clear();
});
window.addEventListener('pageshow', event => { if (event.persisted) requestAnimationFrame(() => requestAnimationFrame(() => start(true))); });
requestAnimationFrame(() => requestAnimationFrame(() => { void start(); }));
