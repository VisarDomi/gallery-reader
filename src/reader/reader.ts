import {fetchMeta, imageUrl} from '../hitomi/hitomi';
import {clean} from './cleanup';

const CSS = 'body{background:#000;margin:0;font-size:16px;overflow:visible!important}' +
    'img.hs-r-img{display:block;width:100%;height:auto}';

async function applySrc(files: { hash: string; name: string; width: number; height: number }[], gid: number) {
    const urls = await Promise.all(
        files.map((_, idx) => imageUrl(gid, idx))
    );

    urls.forEach((url, idx) => {
        const img = document.getElementById(`img-${idx}`) as HTMLImageElement;
        img.src = url;
    });
}

export async function open(gid: number, startPage: number): Promise<void> {
    clean();
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    document.body.innerHTML = '';
    document.body.style.background = '#000';
    document.documentElement.style.scrollBehavior = 'auto';

    const meta = await fetchMeta(gid);
    const files = meta.files || [];
    for (let idx = 0; idx < files.length; idx++) {
        const div = document.createElement('div');
        div.style.cssText = 'width:100%';
        div.style.aspectRatio = files[idx].width + '/' + files[idx].height;
        div.dataset.pageIndex = String(idx);
        const img = document.createElement('img');
        img.id = `img-${idx}`;
        img.className = 'hs-r-img';
        img.loading = 'lazy';
        div.appendChild(img);
        document.body.appendChild(div);
    }

    if (startPage) {
        const el = document.querySelector(`[data-page-index="${startPage}"]`);
        if (el instanceof HTMLElement) {
            const maxST = document.documentElement.scrollHeight - window.innerHeight;
            window.scrollTo(0, Math.max(0, Math.min(maxST, el.offsetTop - window.innerHeight / 2)));
        }
    }

    // await applySrc(files, gid);

    window.addEventListener('scrollend', () => {
        setTimeout(() => {
            const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
            const page = el?.closest('[data-page-index]');
            if (page) {
                const idx = Number((page as HTMLElement).dataset.pageIndex);
                const hash = '#' + (idx + 1);
                if (window.location.hash !== hash) history.replaceState(null, '', hash);
            }
        }, 100);
    });
}
