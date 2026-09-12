// Native transport only. Providers continue to use the same Fetch API in their worker.
export function installFetch(send: (request: unknown) => Promise<any>) {
    const original = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        if (!request.url.startsWith('https://')) return original(input, init);
        request.signal.throwIfAborted();
        const result = await send({ url: request.url, method: request.method,
            headers: Object.fromEntries(request.headers), referrer: request.referrer,
            body: ['GET', 'HEAD'].includes(request.method) ? null : await request.text() });
        request.signal.throwIfAborted();
        const bytes = Uint8Array.from(atob(result.body), c => c.charCodeAt(0));
        return new Response([204,205,304].includes(result.status) ? null : bytes, { status: result.status, headers: result.headers });
    };
}
