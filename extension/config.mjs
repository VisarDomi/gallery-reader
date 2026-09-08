// Scope the response-header policy to the documents that Gallery Reader owns.
// Gallery metadata fetched by the worker is NOT a main_frame request.
export const documentFilters = [
    '^https://hitomi[.]la/($|[?]|index|search[.]html|tag/|artist/|group/|series/|character/|type/|reader/)',
    '^https://imhentai[.]xxx/($|[?]|search/|tag/|language/|artist/|parody/|category/|character/|group/|view/[0-9]+(/|$|[?]))',
];

// Original inline handlers and external scripts have no matching nonce. The
// statically registered MAIN-world bundle deliberately authorizes only its four
// post-takeover Hitomi libraries. Blob workers keep page-origin IndexedDB/fetch.
// This is a takeover policy, not a sandbox against those trusted libraries.
export const pagePolicy = nonce => `script-src 'nonce-${nonce}'; script-src-attr 'none'; worker-src blob:; object-src 'none'; frame-src 'none'`;

export function extensionManifest(version) {
    return {
        manifest_version: 3,
        name: 'Gallery Reader Extension',
        version,
        description: 'Gallery Reader document-start takeover for Hitomi and IMHentai.',
        permissions: ['declarativeNetRequestWithHostAccess'],
        host_permissions: ['https://hitomi.la/*', 'https://imhentai.xxx/*'],
        content_scripts: [{
            matches: ['https://hitomi.la/*', 'https://imhentai.xxx/*'],
            js: ['content.js'],
            run_at: 'document_start',
            world: 'MAIN',
            all_frames: false,
        }],
        declarative_net_request: { rule_resources: [{ id: 'page-script-policy', enabled: true, path: 'rules.json' }] },
    };
}

export function extensionRules(nonce) {
    return documentFilters.map((regexFilter, index) => ({
        id: index + 1,
        priority: 1,
        action: {
            type: 'modifyHeaders',
            responseHeaders: [{ header: 'content-security-policy', operation: 'append', value: pagePolicy(nonce) }],
        },
        condition: { regexFilter, resourceTypes: ['main_frame'], isUrlFilterCaseSensitive: true },
    }));
}
