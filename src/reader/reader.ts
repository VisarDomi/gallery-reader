import {fetchMeta, imageUrl} from '../hitomi/hitomi';
import {clean} from './cleanup';

const CSS = 'body{background:#000;margin:0;font-size:16px;overflow:visible!important}' +
    'img.hs-r-img{display:block;width:100%;height:auto}'
    ;

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
    const pages: HTMLElement[] = [];
    for (let idx = 0; idx < files.length; idx++) {
        const div = document.createElement('div');
        div.style.cssText = 'width:100%';
        div.style.aspectRatio = files[idx].width + '/' + files[idx].height;
        const img = document.createElement('img');
        img.id = `img-${idx}`;
        img.className = 'hs-r-img';
        img.loading = 'lazy';
        img.dataset.pageIndex = String(idx);
        div.appendChild(img);
        document.body.appendChild(div);
        pages.push(div);
    }

    if (pages[startPage]) {
        const el = pages[startPage];
        const maxST = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, Math.min(maxST, el.offsetTop - window.innerHeight / 2)));
    }
    // await applySrc(files, gid);

    let scrollTimer: ReturnType<typeof setTimeout>;
    window.onscroll = function () {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
            let bestIdx = 0, bestVis = 0;
            for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                const vis = Math.min(p.offsetTop + p.offsetHeight, window.scrollY + window.innerHeight) - Math.max(p.offsetTop, window.scrollY);
                if (vis > bestVis) { bestVis = vis; bestIdx = i; }
            }
            if (window.location.hash !== '#' + (bestIdx + 1)) {
                history.replaceState(null, '', '#' + (bestIdx + 1));
            }
        }, 100);
    };
}
