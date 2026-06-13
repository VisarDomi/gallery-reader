import {thumbUrl} from '../hitomi/hitomi';
import {isFav, toggleFav} from '../hitomi/db';
import {show as showInfo} from '../info-modal/info-modal';


export function render(gid: number, files: { hash: string }[]): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'hs-row-wrap';
    
    const strip = document.createElement('div');
    strip.className = 'hs-row';
    for (let i = 0; i < files.length; i++) {
        const img = document.createElement('img');
        img.className = 'hs-thumb';
        img.loading = 'lazy';
        img.src = thumbUrl(files[i]);
        img.onclick = () => {
            window.location.href = `https://hitomi.la/reader/${gid}.html#${i + 1}`;
        };
        strip.appendChild(img);
    }
    wrap.appendChild(strip);
    const overlay = document.createElement('div');
    overlay.className = 'row-title-overlay';
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const infoBtn = document.createElement('button');
    infoBtn.className = 'row-action-btn info-btn';
    infoBtn.textContent = 'i';
    infoBtn.onclick = (e) => {
        e.stopPropagation();
        showInfo(gid);
    };
    actions.appendChild(infoBtn);
    const favBtn = document.createElement('button');
    favBtn.className = 'row-action-btn';
    isFav(gid).then(f => {
        favBtn.textContent = f ? '\u2764\uFE0F' : '\uD83E\uDD0D';
    });
    favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFav(gid).then(f => {
            favBtn.textContent = f ? '\u2764\uFE0F' : '\uD83E\uDD0D';
        });
    };
    actions.appendChild(favBtn);
    overlay.appendChild(actions);
    wrap.appendChild(overlay);
    return wrap;
}
