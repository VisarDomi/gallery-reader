// ── opaque container types ────────────────────────────────────────────
// Each provider defines its own shape; the app only calls provider
// methods and reads width/height from ReaderImage.

export interface Thumbnail {
    // provider-internal data for thumbUrl()
}
export interface ReaderImage {
    width: number;
    height: number;
    // provider-internal data for imageUrls()
}

// ── public types ──────────────────────────────────────────────────────

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
    pageCount: number;
}

export interface GallerySummary {
    pageCount: number;
    thumbs: Thumbnail[];
}

export interface SearchResults {
    galleryIds: number[];
    totalResults: number;
    pageSize: number;
}

export enum Handler { Home, Search, Reader }

export type RouteMatch =
    | { handler: Handler.Home }
    | { handler: Handler.Search; query: string; page: number }
    | { handler: Handler.Reader; gid: number; index: number };

// ── provider interface ────────────────────────────────────────────────

export interface Provider {
    readonly name: string;

    matchRoute(pathname: string, search: string, hash: string): Promise<RouteMatch | null>;
    init(): Promise<void>;

    // ── core ──────────────────────────────────────────────────────────
    search(rawQuery: string, page: number): Promise<SearchResults>;
    getMeta(gid: number): Promise<GalleryMeta>;
    getGallerySummary(gid: number): Promise<GallerySummary>;
    getReaderData(gid: number): Promise<{ images: ReaderImage[]; meta: GalleryMeta }>;

    // ── URL constructors ──────────────────────────────────────────────
    readerUrl(gid: number, index?: number): string;
    searchUrl(rawQuery: string, page?: number): Promise<string>;
    tagSearchUrl(ns: string, value: string, language: string): Promise<string>;
    thumbUrl(thumb: Thumbnail): string;
    imageUrls(images: ReaderImage[]): Promise<string[]>;
}
