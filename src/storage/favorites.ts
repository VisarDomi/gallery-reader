import { computeRequest } from '../core/compute/transport';
export const getFavs = () => computeRequest<number[]>('favorites');
export const isFav = (gid: number) => computeRequest<boolean>('favorite-is', gid);
export const toggleFav = (gid: number) => computeRequest<boolean>('favorite-toggle', gid);
export const importFavs = (raw: string) => computeRequest<{ added: number; total: number }>('favorite-import', raw);
export const exportFavs = () => computeRequest<string>('favorites-export');
export const homePage = (page?: number) => computeRequest<{ page: number; ids: number[]; total: number }>('home-page', page);
