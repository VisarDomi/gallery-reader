export const DOMAIN = 'hentaipaw.com';
export const CDN = 'cdn.imagedeliveries.com';
export const NAMESPACES = ['artist', 'group', 'parody', 'character', 'tag'] as const;
export type Namespace = typeof NAMESPACES[number];
export const PAGE_SIZE = 30;
