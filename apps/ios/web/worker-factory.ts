// Use the shared compute transport. This factory only bridges a Blob worker's
// network requests to URLSession; WebKit retains its state along with bfcache.
import workerCode from '@worker-code';
import { native } from './native';
export function createWorker(): Worker {
    const url = URL.createObjectURL(new Blob([workerCode], {type:'text/javascript'}));
    const worker = new Worker(url), requests = new Set<string>();
    let alive = true;
    const cancel = (requestID: string) => { void native('fetch-cancel', {requestID}).catch(() => {}); };
    const terminate = worker.terminate.bind(worker);
    const discard = (event: PageTransitionEvent) => { if (!event.persisted) worker.terminate(); };
    worker.terminate = () => {
        if (!alive) return;
        alive = false;
        for (const id of requests) cancel(id);
        requests.clear(); URL.revokeObjectURL(url);
        removeEventListener('pagehide', discard);
        terminate();
    };
    addEventListener('pagehide', discard);
    const send = worker.postMessage.bind(worker);
    worker.postMessage = (message: any, options?: any) => {
        if (message.op === 'provider') message = {...message, payload:{...message.payload,referrer:__IOS_ORIGIN__+'/'}};
        send(message, options);
    };
    worker.addEventListener('message', async ({data}) => {
        if (!alive) return;
        if (data.cancelRequest) { cancel(data.cancelRequest); return; }
        if (!data.networkId) return;
        const id = data.request.requestID;
        requests.add(id);
        try {
            const result = await native('fetch', data.request);
            if (alive) worker.postMessage({networkId:data.networkId,result});
        } catch (error) {
            if (alive) worker.postMessage({networkId:data.networkId,error:String(error)});
        } finally { requests.delete(id); }
    });
    return worker;
}
