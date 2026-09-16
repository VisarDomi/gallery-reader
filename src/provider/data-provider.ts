import { provider as hitomi } from './hitomi/data-provider';
import { provider as imhentai } from './imhentai/data-provider';
export const dataProvider = (id: string) => id === 'hitomi' ? hitomi : imhentai;
