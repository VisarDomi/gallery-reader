import workerCode from '@worker-code';
let worker: Worker | undefined;
let next = 0;
const pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>();
export function closeWorker() {
    worker?.terminate(); worker = undefined;
    for (const item of pending.values()) item.reject(new Error('Document suspended'));
    pending.clear();
}
export function computeRequest<T = unknown>(op: string, payload?: any): Promise<T> {
    if (!worker) {
        const url = URL.createObjectURL(new Blob([workerCode], {type:'text/javascript'}));
        worker = new Worker(url);
        const current = worker;
        current.onmessage = async ({data}) => {
            if (data.networkId) {
                try {
                    const result = await window.webkit.messageHandlers.gallery.postMessage({command:'fetch', args:data.request});
                    if (worker === current) current.postMessage({networkId:data.networkId, result:JSON.parse(result)});
                } catch (error) { if (worker === current) current.postMessage({networkId:data.networkId, error:String(error)}); }
                return;
            }
            const item = pending.get(data.id); pending.delete(data.id);
            if (data.ok) item?.resolve(data.value); else item?.reject(new Error(data.error));
        };
        current.onerror = event => {
            for (const item of pending.values()) item.reject(new Error(event.message));
            closeWorker();
        };
        // Keep the blob URL for the document lifetime (WebKit worker startup is asynchronous).
        addEventListener('pagehide', () => URL.revokeObjectURL(url), {once:true});
    }
    if (op === 'provider') payload = {...payload, referrer:__IOS_ORIGIN__ + '/'};
    return new Promise((resolve,reject) => {
        const id = ++next; pending.set(id,{resolve,reject}); worker!.postMessage({id,op,payload});
    });
}
