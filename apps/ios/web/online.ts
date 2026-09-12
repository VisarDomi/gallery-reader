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
export const pageState = { total: 0, size: 25, current: currentPage };
const nativeDocument = crypto.randomUUID();
const native = async (command: string, args = {}) => JSON.parse(await window.webkit.messageHandlers.gallery.postMessage({command,args:{...args,document:nativeDocument}}));
installFetch(args => native('fetch', args as any));
const manifests = new Map<string, Promise<any>>();
const idOf = (key: string) => {
    if (!new RegExp(`^${provider.providerId}-[1-9][0-9]*$`).test(key)) throw new Error('Invalid gallery');
    return Number(key.split('-')[1]);
};
async function describe(key: string) {
    if (!manifests.has(key)) {
        const task = (async () => {
            const id = idOf(key);
            const saved = await native('manifest-read',{key});
            if (saved.manifest) return saved.manifest;
            const data = await provider.getReaderData(id);
            const [urls, thumbs] = await Promise.all([provider.imageUrls(data.images), provider.getGalleryThumbnails(id)]);
            const manifest = {title:data.meta.title, meta:data.meta,
                pages:data.images.map((image: any,index: number) => ({...image,url:urls[index]})),
                thumbnails:{pages:thumbs.map((thumb: any) => ({url:provider.thumbUrl(thumb)}))}};
            await native('manifest-write',{key,manifest});
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
    await initializeStorage();
    let ids: number[];
    if (query !== null) {
        const result = await provider.search(query,currentPage);
        ids = result.galleryIds; pageState.total = result.totalResults; pageState.size = result.pageSize;
        await saveSearch(query,currentPage);
    } else {
        const result = await homePage(currentPage);
        currentPage = result.page; ids = result.ids; pageState.total = result.total;
        await savePage(currentPage);
    }
    pageState.current = currentPage;
    if (!params.has('read')) history.replaceState(null,'',pageURL(currentPage));
    if (document.querySelector('.hs-saved-searches')) await savedSearches();
    return {version:1, items:ids.map(id => ({key:`${provider.providerId}-${id}`,id:String(id),provider:provider.providerId,title:'',ready:true}))};
}
export async function paginate(page: number) {
    await window.galleryViewState?.save();
    currentPage = page;
    notify?.({type:'catalog',catalog:await catalog(),downloads:[]});
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
                            if (alive) worker.onmessage?.({data:{type:'catalog',catalog:list,downloads:[]}});
                        }
                        result = {supported:true};
                    } else if (command === 'describe' || command === 'open') {
                        const manifest = await describe(args.key);
                        result = {manifest,state:{complete:true,total:manifest.pages.length,downloaded:manifest.pages.length}};
                    } else if (command === 'page' || command === 'thumbnail') {
                        const manifest = await describe(args.key);
                        const page = (command === 'page' ? manifest.pages : manifest.thumbnails.pages)[args.index];
                        if (!page?.url) throw new Error('Image URL missing');
                        result = {url:`gallery://app/image?url=${encodeURIComponent(page.url)}`};
                    }
                    if (alive) worker.onmessage?.({data:{id,result}});
                } catch (error) { if (alive) worker.onmessage?.({data:{id,error:(error as Error).message}}); }
            },
            terminate() { alive = false; notify = undefined; closeWorker(); }
        };
        notify = data => { if (alive) worker.onmessage?.({data}); };
        return worker;
    }
};
