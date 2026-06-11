import {fetchMeta, imageUrl} from '../hitomi/hitomi';
import {clean} from '../cleanup';
import {createButton} from '../ocr-button/ocr-button';
import {doOcr} from '../ocr-button/ocr-service';

const CSS = 'body{background:#000;margin:0;font-size:16px;overflow:visible!important}' +
    'img.hs-r-img{display:block;width:100%;height:auto}' +
    '.hs-ocr-overlay{position:fixed;z-index:2500;pointer-events:none}' +
    '.hs-ocr-fab{width:64px;height:64px;padding:0;border:none;border-radius:999px;background:rgba(20,20,20,0.92);color:#fff;box-shadow:0 10px 24px rgba(0,0,0,0.35);pointer-events:auto;touch-action:manipulation;display:flex;align-items:center;justify-content:center;transition:background-color 120ms ease,opacity 120ms ease}' +
    '.hs-ocr-fab:active{background:rgba(34,34,34,0.96)}' +
    '.hs-ocr-fab--failed{background:rgba(104,25,25,0.96)}' +
    '.hs-ocr-icon{width:24px;height:24px}' +
    '.hs-ocr-icon--spin{animation:hs-ocr-spin 0.9s linear infinite}' +
    '@keyframes hs-ocr-spin{to{transform:rotate(360deg)}}' +
    '.hs-ocr-result{position:fixed;bottom:90px;right:20px;background:#333;color:#fff;padding:10px 16px;border-radius:6px;font-size:14px;z-index:9999;max-width:300px}';

const MARGIN = 16;
const BTN_SIZE = 64;

function positionOverlay(el: HTMLElement): void {
    const vv = window.visualViewport;
    if (!vv) return;
    el.style.left = (vv.offsetLeft + vv.width - MARGIN - BTN_SIZE) + 'px';
    el.style.top = (vv.offsetTop + vv.height - MARGIN - BTN_SIZE) + 'px';
    el.style.setProperty('--reader-ocr-scale', String(1 / (vv.scale || 1)));
}

export async function open(gid: number, startPage: number): Promise<void> {
    clean();
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    document.body.innerHTML = '';
    document.body.style.background = '#000';
    document.documentElement.style.scrollBehavior = 'auto';

    const ocrBtn = createButton();
    let overlay: HTMLDivElement | null = null;
    let lookupInFlight = false;

    ocrBtn.btn.onclick = async function (e) {
        e.stopPropagation();
        if (lookupInFlight) return;
        lookupInFlight = true;
        ocrBtn.setPhase('ocr');
        try {
            const result = await doOcr(gid);
            ocrBtn.setPhase('idle');
            lookupInFlight = false;
            window.location.href = "shirabelookup://search?w=" + encodeURIComponent(result.text);
            return;
        } catch (err) {
            ocrBtn.setPhase('failed');
            const div = document.createElement('div');
            div.className = 'hs-ocr-result';
            div.textContent = (err as Error).message || 'OCR failed';
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 3000);
            setTimeout(() => ocrBtn.setPhase('idle'), 2000);
        }
        lookupInFlight = false;
    };

    document.onclick = function (e) {
        if ((e.target as HTMLElement).closest('.hs-ocr-fab, .hs-ocr-result')) return;
        if (overlay) {
            overlay.remove();
            overlay = null;
        } else {
            overlay = document.createElement('div');
            overlay.className = 'hs-ocr-overlay';
            overlay.style.transform = 'scale(var(--reader-ocr-scale))';
            overlay.style.transformOrigin = 'bottom right';
            overlay.appendChild(ocrBtn.btn);
            document.body.appendChild(overlay);
            positionOverlay(overlay);
            ocrBtn.show();

            if (window.visualViewport) {
                const onVp = () => { if (overlay) positionOverlay(overlay); };
                window.visualViewport.addEventListener('resize', onVp, { passive: true });
                window.visualViewport.addEventListener('scroll', onVp, { passive: true });
            }
        }
    };

    try {
        const meta = await fetchMeta(gid);
        const files = meta.files || [];
        const pages: HTMLElement[] = [];
        for (let idx = 0; idx < files.length; idx++) {
            const div = document.createElement('div');
            div.style.cssText = 'width:100%';
            div.style.aspectRatio = files[idx].width + '/' + files[idx].height;
            const img = document.createElement('img');
            img.className = 'hs-r-img';
            img.loading = 'lazy';
            img.dataset.pageIndex = String(idx);
            imageUrl(gid, idx).then(function (url) {
                img.src = url;
            }).catch(function retry() {
                img.style.background = '#333';
                img.style.minHeight = '200px';
                img.style.cursor = 'pointer';
                img.alt = 'Failed to load page ' + (idx + 1);
                img.onclick = function () {
                    img.style.background = '';
                    img.style.minHeight = '';
                    img.style.cursor = '';
                    img.alt = '';
                    img.onclick = null;
                    imageUrl(gid, idx).then(function (url) {
                        img.src = url;
                    }).catch(retry);
                };
            });
            div.appendChild(img);
            document.body.appendChild(div);
            pages.push(div);
        }
        requestAnimationFrame(function () {
            if (pages[startPage]) {
                const el = pages[startPage];
                const maxST = document.documentElement.scrollHeight - window.innerHeight;
                window.scrollTo(0, Math.max(0, Math.min(maxST, el.offsetTop - window.innerHeight / 2)));
            }
            setTimeout(function () { suppressSave = false; }, 500);
        });
        let suppressSave = true;
        let scrollTimer: ReturnType<typeof setTimeout>;
        window.onscroll = function () {
            if (suppressSave) return;
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
    } catch (err) {
        document.body.textContent = 'Failed to load gallery';
        document.body.style.cssText = 'color:#f44;padding:20px;text-align:center';
    }
}
