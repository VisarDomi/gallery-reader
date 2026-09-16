import { native } from './native';
import { installFetch } from './fetch';
import { receive } from './platform';
import { startInit } from '../../../src/ui/shell';
import { init as home } from '../../../src/routes/home';
import { init as search } from '../../../src/routes/search';
import { open } from '../../../src/routes/reader';

installFetch(args => native('fetch', args as any), requestID => { void native('fetch-cancel', {requestID}).catch(() => {}); });
async function start() {
    receive(await native('init'));
    startInit(__IOS_PROVIDER__ === 'hitomi' ? 'Hitomi' : 'Imhen');
    const params = new URLSearchParams(location.search), read = params.get('read');
    if (read?.startsWith(__IOS_PROVIDER__ + '-')) {
        await open(Number(read.split('-')[1]), Math.max(0, Number(params.get('page') || 1) - 1));
    } else if (params.has('q')) await search(params.get('q')!, Math.max(1,Number(params.get('p')) || 1));
    else await home();
}
void start().catch(console.error);
