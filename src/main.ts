import { Handler, initializeProviderRoute } from './provider';
import { init as initHome } from './routes/home';
import { init as initSearch } from './routes/search';
import { open } from './routes/reader';
import {startInit} from "./ui/shell";

const { pathname, search, hash, hostname } = window.location;
const match = initializeProviderRoute(hostname, pathname, search, hash);
if (match) {
    startInit(match.documentTitle);
    switch (match.route.handler) {
        case Handler.Home:
            void initHome();
            break;
        case Handler.Search:
            void initSearch(match.route.query, match.route.page);
            break;
        case Handler.Reader:
            void open(match.route.gid, match.route.index);
            break;
    }
}
