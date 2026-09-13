import * as provider from './provider';
import { initializeStorage } from '../../../src/storage/initialize';
import { homePage } from '../../../src/storage/favorites';
import { saveSearch, savePage } from '../../../src/storage/preferences';
import { render as savedSearches } from '../../../src/ui/saved-searches';
import { buildSearch } from '../../../src/ui/shell';
import { buildImportSection } from '../../../src/routes/home';
import { createGalleryActions } from '../../../src/ui/gallery-row';
import { show as showInfo } from '../../../src/ui/info-modal';
import { closeWorker } from './transport';
import { installFetch } from './fetch';
const params = new URLSearchParams(location.search);
export const query = params.get('q');
let currentPage = Math.max(1, Number(params.get('p')) || 1);
let requestedHomePage = params.has('p') ? currentPage : undefined;
let catalogGeneration = 0;
export const pageState = { total: 0, size: 25, current: currentPage };
const nativeDocument = crypto.randomUUID();
const native = async (command: string, args = {}) => JSON.parse(await window.webkit.messageHandlers.gallery.postMessage({command,args:{...args,document:nativeDocument}}));
installFetch(args => native('fetch', args as any), requestID => { void native('fetch-cancel', {requestID}).catch(() => {}); });
const manifests = new Map<string, Promise<any>>();
const previews = new Map<string, Promise<any>>();
const imageURLs = new Map<string, Promise<string[]>>();
const idOf = (key: string) => {
    if (!new RegExp(`^${provider.providerId}-[1-9][0-9]*$`).test(key)) throw new Error('Invalid gallery');
    return Number(key.split('-')[1]);
};
async function preview(key: string) {
    if (!previews.has(key)) {
        const task = provider.getGalleryThumbnails(idOf(key)).then(thumbs => ({
            pages: thumbs.map(thumb => ({ url: provider.thumbUrl(thumb) })),
        }));
        previews.set(key, task);
        void task.catch(() => previews.delete(key));
    }
    return previews.get(key)!;
}
async function describe(key: string) {
    if (!manifests.has(key)) {
        const task = (async () => {
            const id = idOf(key);
            const data = await provider.getReaderData(id);
            const manifest = {title:data.meta.title, meta:data.meta, pages:data.images};
            return manifest;
        })();
        manifests.set(key, task);
        void task.catch(() => manifests.delete(key));
    }
    return manifests.get(key)!;
}
export async function actions(item: any) { return createGalleryActions(idOf(item.key)); }
export const info = (item: any) => showInfo(idOf(item.key));
export const pageURL = (page: number) => query === null ? `/?p=${page}` : provider.searchUrl(query,page);
let notify: ((data: any) => void) | undefined;
async function catalog() {
    const generation = ++catalogGeneration, requestedPage = currentPage;
    await initializeStorage();
    let ids: number[], total: number, size = 25, page = requestedPage;
    if (query !== null) {
        const result = await provider.search(query, requestedPage);
        ids = result.galleryIds; total = result.totalResults; size = result.pageSize;
    } else {
        const result = await homePage(requestedHomePage);
        page = result.page; ids = result.ids; total = result.total;
    }
    if (generation !== catalogGeneration) return;
    currentPage = page; requestedHomePage = page;
    Object.assign(pageState, {total, size, current:page});
    if (!params.has('read')) history.replaceState(null,'',pageURL(page));
    // Like source Home, rendering and restore do not wait for persistence.
    const saved = query === null ? savePage(page) : saveSearch(query,page);
    void saved.then(() => savedSearches()).catch(console.error);
    return {version:1, items:ids.map(id => ({key:`${provider.providerId}-${id}`,id:String(id),provider:provider.providerId,title:'',ready:true}))};
}
export async function paginate(page: number) {
    await window.galleryViewState?.save();
    currentPage = page; requestedHomePage = page;
    const list = await catalog();
    if (list) notify?.({type:'catalog',catalog:list});
}
async function refresh() { await paginate(currentPage); }
export function setup() {
    if (params.has('read')) return;
    buildSearch();
    document.body.prepend(document.getElementById('hs-wrap')!,document.querySelector('.hs-saved-searches')!);
    (document.getElementById('query-input') as HTMLTextAreaElement).value = query || '';
    if (query === null) buildImportSection(refresh);
    void provider.initProvider()?.catch(console.error);
    addEventListener('reader-data-restored', () => { void refresh(); });
}
window.nativeGallery = {
    savePosition: (position: any) => native('view-save',{position}).catch(() => {}),
    reportStartup: () => {},
    continueLoading: () => { if (!params.has('read') && query === null) void provider.backupHome(); },
    createWorker() {
        let alive = true;
        const worker = {onmessage:null as any, onerror:null as any,
            async postMessage({id,command,args = {}}: any) {
                try {
                    let result: any = {};
                    if (command === 'init') {
                        const state = await native('init');
                        if (!alive) return;
                        if (state.redirect) { location.replace(state.redirect); return; }
                        window.galleryViewState.receive(state.position,!!state.resumeReader);
                        if (state.resumeReader) { setTimeout(() => location.assign(state.resumeReader),0); return; }
                        await initializeStorage();
                        if (!params.has('read')) {
                            const list = await catalog();
                            if (alive && list) worker.onmessage?.({data:{type:'catalog',catalog:list}});
                        }
                        result = {supported:true};
                    } else if (command === 'describe') {
                        const thumbnails = await preview(args.key);
                        result = {manifest:{pages:thumbnails.pages,thumbnails}};
                    } else if (command === 'open') {
                        const manifest = await describe(args.key);
                        result = {manifest};
                    } else if (command === 'page' || command === 'thumbnail') {
                        let url: string;
                        if (command === 'page') {
                            const manifest = await describe(args.key);
                            if (!imageURLs.has(args.key)) {
                                const task = provider.imageUrls(manifest.pages);
                                imageURLs.set(args.key, task);
                                void task.catch(() => imageURLs.delete(args.key));
                            }
                            url = (await imageURLs.get(args.key)!)[args.index];
                        } else url = (await preview(args.key)).pages[args.index]?.url;
                        if (!url) throw new Error('Image URL missing');
                        result = {url:`gallery://app/image?url=${encodeURIComponent(url)}`};
                    }
                    if (alive) worker.onmessage?.({data:{id,result}});
                } catch (error) { if (alive) worker.onmessage?.({data:{id,error:(error as Error).message}}); }
            },
            terminate() { alive = false; notify = undefined; catalogGeneration++; closeWorker(); }
        };
        notify = data => { if (alive) worker.onmessage?.({data}); };
        return worker;
    }
};
