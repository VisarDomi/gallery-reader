import { thumbUrl, readerUrl, type Thumbnail } from '../provider';
import {isFav, toggleFav} from '../storage/favorites';
import {registerImage} from '../core/image-retry';
import {show as showInfo} from './info-modal';
import {scheduleFavoritesSync} from '../provider';

const SKELETON_HEIGHT = 300;

export function createSkeletonRow(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'hs-row-wrap';
    wrap.style.height = SKELETON_HEIGHT + 'px';
    return wrap;
}

export async function populateRow(
    container: HTMLDivElement,
    gid: number,
    thumbs: Thumbnail[],
): Promise<void> {
    if (!container.isConnected) return;
    container.innerHTML = '';
    container.style.height = '';

    const strip = document.createElement('div');
    strip.className = 'hs-row';
    container.appendChild(strip);

    for (let i = 0; i < thumbs.length; i++) {
        const img = document.createElement('img');
        img.className = 'hs-thumb';
        img.loading = 'lazy';
        img.src = thumbUrl(thumbs[i]);
        registerImage(img);
        img.onclick = () => {
            window.location.href = readerUrl(gid, i);
        };
        strip.appendChild(img);
        if (i % 32 === 31) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (!container.isConnected) return;
        }
    }

    const overlay = document.createElement('div');
    overlay.className = 'row-title-overlay';
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const infoBtn = document.createElement('button');
    infoBtn.className = 'row-action-btn info-btn';
    infoBtn.textContent = 'i';
    infoBtn.onclick = (e) => {
        e.stopPropagation();
        void showInfo(gid);
    };
    actions.appendChild(infoBtn);

    const favBtn = document.createElement('button');
    favBtn.className = 'row-action-btn';
    favBtn.textContent = '…';
    favBtn.disabled = true;
    favBtn.onclick = async (e) => {
        e.stopPropagation();
        favBtn.disabled = true;
        try {
            favBtn.textContent = await toggleFav(gid) ? '\u2764\uFE0F' : '\uD83E\uDD0D';
            scheduleFavoritesSync();
        } finally { favBtn.disabled = false; }
    };
    actions.appendChild(favBtn);

    overlay.appendChild(actions);
    container.appendChild(overlay);
    favBtn.textContent = await isFav(gid) ? '\u2764\uFE0F' : '\uD83E\uDD0D';
    favBtn.disabled = false;
}
