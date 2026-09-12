import { installFetch } from './fetch';
import '../../../src/core/compute/worker-entry';
let next = 0;
const pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>();
installFetch(request => new Promise((resolve, reject) => {
    const networkId = ++next;
    pending.set(networkId, {resolve, reject});
    postMessage({ networkId, request });
}));
addEventListener('message', event => {
    if (!event.data.networkId) return;
    const item = pending.get(event.data.networkId);
    pending.delete(event.data.networkId);
    if (event.data.error) item?.reject(new Error(event.data.error));
    else item?.resolve(event.data.result);
});
