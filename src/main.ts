import { providers, init, Handler } from './provider';
import type { ProviderName } from './provider';
import { init as initHome } from './routes/home';
import { init as initSearch } from './routes/search';
import { open } from './routes/reader';

const { pathname, search, hash } = window.location;

for (const name of Object.keys(providers) as ProviderName[]) {
    const match = providers[name].matchRoute(pathname, search, hash);
    if (match) {
        init(name);
        switch (match.handler) {
            case Handler.Home:
                void initHome();
                break;
            case Handler.Search:
                void initSearch(match.query, match.page);
                break;
            case Handler.Reader:
                void open(match.gid, match.hash);
                break;
        }
        break;
    }
}
