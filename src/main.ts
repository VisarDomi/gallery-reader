import {init as homeInit} from './home-page/home-page';
import {init as searchInit} from './search-page/search-page';
import {open} from './reader/reader';

const path = window.location.pathname;
if (path === '/' || path === '/index.html') {
    setTimeout(homeInit, 500);
} else if (path.startsWith('/search.html') || path.startsWith('/tag/') || path.startsWith('/artist/') ||
    path.startsWith('/group/') || path.startsWith('/series/') || path.startsWith('/character/') || path.startsWith('/type/')) {
    setTimeout(searchInit, 500);
} else {
    const m = path.match(/\/reader\/(\d+)\.html/);
    if (m) {
        const hash = window.location.hash.match(/#(\d+)/);
        open(parseInt(m[1]), hash ? parseInt(hash[1]) - 1 : 0);
    }
}
