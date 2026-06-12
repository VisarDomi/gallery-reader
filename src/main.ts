import { init as homeInit } from './home-page/home-page';
import { init as searchInit } from './search-page/search-page';
import { open as readerOpen } from './reader/reader';

const RouteKind = {
    Home: 'home',
    Search: 'search',
    Reader: 'reader',
    NotFound: 'notFound',
} as const;

type AppRoute =
    | { kind: typeof RouteKind.Home }
    | { kind: typeof RouteKind.Search }
    | { kind: typeof RouteKind.Reader; id: number; page: number }
    | { kind: typeof RouteKind.NotFound };

const searchPrefixes = [
    '/search.html',
    '/tag/',
    '/artist/',
    '/group/',
    '/series/',
    '/character/',
    '/type/',
] as const;

function parseRoute(path: string, hash: string): AppRoute {
    if (path === '/' || path === '/index.html') {
        return { kind: RouteKind.Home };
    }

    if (searchPrefixes.some(prefix => path.startsWith(prefix))) {
        return { kind: RouteKind.Search };
    }

    const readerMatch = path.match(/^\/reader\/(\d+)\.html$/);
    if (readerMatch) {
        const hashMatch = hash.match(/^#(\d+)$/);

        return {
            kind: RouteKind.Reader,
            id: Number(readerMatch[1]),
            page: hashMatch ? Number(hashMatch[1]) - 1 : 0,
        };
    }

    return { kind: RouteKind.NotFound };
}

function runRoute(route: AppRoute): void {
    switch (route.kind) {
        case RouteKind.Home:
            homeInit();
            return;

        case RouteKind.Search:
            searchInit();
            return;

        case RouteKind.Reader:
            void readerOpen(route.id, route.page);
            return;

        case RouteKind.NotFound:
            return;
    }
}

const route = parseRoute(window.location.pathname, window.location.hash);
runRoute(route);