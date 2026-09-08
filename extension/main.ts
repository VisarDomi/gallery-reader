import { Handler, initializeProviderRoute } from '../src/provider';
import { init as initHome } from '../src/routes/home';
import { init as initSearch } from '../src/routes/search';
import { open } from '../src/routes/reader';
import { startInit } from '../src/ui/shell';
import { installPerformanceProbe } from './performance-probe';

declare const __READER_TAKEOVER_MODE__: string;
declare const __READER_PERFORMANCE_PROBE__: boolean;
type Boot = { entries: number; mode: string; startedAt: number; shellAt?: number; readyAt?: number; firstImageAt?: number; error?: string };
const scope = window as typeof window & { __galleryExtensionBoot?: Boot };
const { hostname, pathname, search, hash } = location;
const match = initializeProviderRoute(hostname, pathname, search, hash);
if (match) {
    // Safari reinjects document_start content scripts synchronously inside
    // document.close(). Window state survives document.open; guard BEFORE it.
    // A real navigation gets a new Window; bfcache restores the existing UI.
    if (scope.__galleryExtensionBoot) {
        scope.__galleryExtensionBoot.entries++;
    } else {
        if (__READER_PERFORMANCE_PROBE__) installPerformanceProbe();
        const boot: Boot = { entries: 1, mode: __READER_TAKEOVER_MODE__, startedAt: performance.now() };
        Object.defineProperty(scope, '__galleryExtensionBoot', { value: boot });
        startInit(match.documentTitle);
        boot.shellAt = performance.now();
        document.addEventListener('load', event => {
            if (boot.firstImageAt === undefined && event.target instanceof HTMLImageElement) boot.firstImageAt = performance.now();
        }, true);
        const task = match.route.handler === Handler.Home ? initHome()
            : match.route.handler === Handler.Search ? initSearch(match.route.query, match.route.page)
            : open(match.route.gid, match.route.index);
        void task.then(() => { boot.readyAt = performance.now(); }, error => {
            boot.error = String(error);
            console.error(error);
        });
    }
}
