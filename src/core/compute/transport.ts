import WorkerConstructor from './worker-entry?worker&inline';
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

/** Lazy: no worker or storage access before route matching and document takeover. */
export function computeRequest<T = unknown>(op: string, payload?: unknown): Promise<T> {
    if (op === 'provider') payload = { ...(payload as object), referrer: location.href };
    return new Promise((resolve, reject) => {
        if (!worker) {
            worker = new WorkerConstructor();
            worker.onmessage = event => {
                const { id, ok, value, error } = event.data;
                const task = pending.get(id);
                if (!task) return;
                pending.delete(id);
                if (ok) task.resolve(value); else task.reject(new Error(error));
            };
            worker.onerror = event => {
                for (const task of pending.values()) task.reject(new Error(event.message || 'Reader worker failed'));
                pending.clear();
                worker?.terminate();
                worker = undefined;
            };
        }
        const id = ++nextId;
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        worker.postMessage({ id, op, payload });
    });
}
