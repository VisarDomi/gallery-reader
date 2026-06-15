import { init as initHome } from './home-page/home-page';
import { init as initSearch } from './search-page/search-page';
import { open } from './reader/reader';

const searchPrefixes = [
    '/search.html',
    '/tag/',
    '/artist/',
    '/group/',
    '/series/',
    '/character/',
    '/type/',
];

const path = window.location.pathname;
if (path === '/' || path.startsWith('/index')) {
    void initHome();
} else if (searchPrefixes.some(prefix => path.startsWith(prefix))) {
    void initSearch();
} else if (path.startsWith('/reader/')) {
    const id = Number(path.slice('/reader/'.length, -'.html'.length));
    void open(id, window.location.hash);
}