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

export enum Handler { Home, Search, Reader }

export type RouteMatch =
    | { handler: Handler.Home }
    | { handler: Handler.Search; query: string; page: number }
    | { handler: Handler.Reader; gid: number; hash: string };

export interface Provider {
    readonly name: string;
    readonly itemsPerPage: number;

    matchRoute(pathname: string, search: string, hash: string): RouteMatch | null;

    init(): Promise<void>;


    readerUrl(gid: number, index?: number): string;
    searchUrl(query: string): string;
    thumbUrl(file: { hash: string }): string;
    imageUrl(gid: number, pageIndex: number): Promise<string>;
    fetchMeta(gid: number): Promise<GalleryMeta>;
    searchGalleries(term: string): Promise<number[]>;
}
