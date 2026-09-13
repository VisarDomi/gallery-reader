import workerCode from '@worker-code';
let worker: Worker | undefined;
let workerURL: string | undefined, suspended = false;
const networkRequests = new Set<string>();
const cancelNetwork = (requestID: string) => { void window.webkit.messageHandlers.gallery.postMessage({command:"fetch-cancel",args:{requestID}}).catch(() => {}); };
let next = 0;
const pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>();
export function closeWorker() {
    worker?.terminate(); worker = undefined;
    if (workerURL) URL.revokeObjectURL(workerURL); workerURL = undefined;
    for (const id of networkRequests) cancelNetwork(id); networkRequests.clear();
    for (const item of pending.values()) item.reject(new Error('Document suspended'));
    pending.clear();
}
addEventListener('pagehide', () => { suspended = true; closeWorker(); });
addEventListener('pageshow', () => { suspended = false; });
export function computeRequest<T = unknown>(op: string, payload?: any): Promise<T> {
    if (suspended) return Promise.reject(new Error('Document suspended'));
    if (!worker) {
        const url = workerURL = URL.createObjectURL(new Blob([workerCode], {type:'text/javascript'}));
        worker = new Worker(url);
        const current = worker;
        current.onmessage = async ({data}) => {
            if (worker !== current) return;
            if (data.cancelRequest) { cancelNetwork(data.cancelRequest); return; }
            if (data.networkId) {
                const requestID = data.request.requestID; networkRequests.add(requestID);
                try {
                    const result = await window.webkit.messageHandlers.gallery.postMessage({command:'fetch', args:data.request});
                    if (worker === current) current.postMessage({networkId:data.networkId, result:JSON.parse(result)});
                } catch (error) { if (worker === current) current.postMessage({networkId:data.networkId, error:String(error)}); }
                finally { networkRequests.delete(requestID); }
                return;
            }
            const item = pending.get(data.id); pending.delete(data.id);
            if (data.ok) item?.resolve(data.value); else item?.reject(new Error(data.error));
        };
        current.onerror = event => {
            for (const item of pending.values()) item.reject(new Error(event.message));
            closeWorker();
        };

    }
    if (op === 'provider') payload = {...payload, referrer:__IOS_ORIGIN__ + '/'};
    return new Promise((resolve,reject) => {
        const id = ++next; pending.set(id,{resolve,reject}); worker!.postMessage({id,op,payload});
    });
}
