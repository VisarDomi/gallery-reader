import {thumbUrl} from '../hitomi/hitomi';
import {isFav, toggleFav} from '../hitomi/db';
import {show as showInfo} from '../info-modal/info-modal';

export const CSS = '.hs-row{display:flex;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;cursor:pointer}' +
    '.hs-row::-webkit-scrollbar{display:none}' +
    '.hs-row-wrap{position:relative;display:block;background:#000;width:100%}' +
    '.hs-thumb{width:100px;height:300px;object-fit:cover;display:block;flex-shrink:0}' +
    '.hs-thumb:hover{opacity:.8}' +
    '.row-title-overlay{position:absolute;bottom:0;right:0;color:#fff;padding:8px 10px;z-index:2;display:flex;justify-content:flex-end;align-items:flex-end;pointer-events:none}' +
    '.row-actions{display:flex;gap:15px;pointer-events:auto}' +
    '.row-action-btn{font-size:32px;cursor:pointer;line-height:1;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:#fff}' +
    '.row-action-btn:active{transform:scale(0.9)}' +
    '.row-action-btn.info-btn{font-size:22px;font-style:italic;font-family:Georgia,"Times New Roman",serif}';

export function render(gid: number, files: { hash: string }[]): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'hs-row-wrap';
    
    const strip = document.createElement('div');
    strip.className = 'hs-row';
    for (let i = 0; i < files.length; i++) {
        const img = document.createElement('img');
        img.className = 'hs-thumb';
        img.loading = 'lazy';
        // img.src = thumbUrl(files[i]);
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
