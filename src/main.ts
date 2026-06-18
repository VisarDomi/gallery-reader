import { matchRoute, Handler } from './provider';
import { init as initHome } from './routes/home';
import { init as initSearch } from './routes/search';
import { open } from './routes/reader';

const { pathname, search, hash } = window.location;
console.log('[main]', pathname, search, hash);
const match = matchRoute(pathname, search, hash);
console.log('[main] match →', match ? JSON.stringify(match) : 'null');
if (match) {
    switch (match.handler) {
        case Handler.Home:
            void initHome();
            break;
        case Handler.Search:
            void initSearch(match.query, match.page);
            break;
        case Handler.Reader:
            void open(match.gid, match.index);
            break;
    }
}
