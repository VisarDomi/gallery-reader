import { matchRoute, Handler } from './provider';
import { init as initHome } from './routes/home';
import { init as initSearch } from './routes/search';
import { open } from './routes/reader';

const { pathname, search, hash } = window.location;
const match = matchRoute(pathname, search, hash);
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
