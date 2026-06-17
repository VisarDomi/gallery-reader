// ── shared types ──────────────────────────────────────────────────────

export interface GalleryMeta {
    title: string;
    title_jpn: string;
    type: string;
    language: string;
    date: string;
    artists: string[];
    groups: string[];
    parody: string[];
    characters: string[];
    tags: { tag: string; female?: string; male?: string }[];
    files: { hash: string; name: string; width: number; height: number }[];
}

export interface Provider {
    readonly itemsPerPage: number;
    readonly searchDomain: string | null;
    readerUrl(gid: number, index?: number): string;
    searchUrl(query: string): string;
    thumbUrl(file: { hash: string }): string;
    imageUrl(gid: number, pageIndex: number): Promise<string>;
    fetchMeta(gid: number): Promise<GalleryMeta>;
    searchGalleries(term: string): Promise<number[]>;
}

// ── active provider ───────────────────────────────────────────────────

export {
    itemsPerPage,
    searchDomain,
    readerUrl,
    searchUrl,
    thumbUrl,
    imageUrl,
    fetchMeta,
    searchGalleries,
} from './hitomi';
