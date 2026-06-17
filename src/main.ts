import { init as initHome } from './routes/home';
import { init as initSearch } from './routes/search';
import { open } from './routes/reader';

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