import { init as homeInit } from './home-page/home-page';
import { init as searchInit } from './search-page/search-page';
import { open } from './reader/reader';
import { cleanUp } from './shared/clean-up';
import './css/style.css'

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
if (path === '/' || path === '/index.html') {
    void cleanUp().then(homeInit);
} else if (searchPrefixes.some(prefix => path.startsWith(prefix))) {
    void cleanUp().then(searchInit);
} else if (path.startsWith('/reader/')) {
    const id = Number(path.slice('/reader/'.length, -'.html'.length));
    void open(id, window.location.hash);
}