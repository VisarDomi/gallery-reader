export interface OcrResult {
    text: string;
    pageIndex: number;
}

export async function doOcr(gid: number): Promise<OcrResult> {
    const imgs = document.querySelectorAll<HTMLImageElement>('.hs-r-img');
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let best: HTMLImageElement | undefined;
    for (const img of imgs) {
        const r = img.getBoundingClientRect();
        if (r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy) {
            best = img;
            break;
        }
    }
    if (!best) throw new Error('No visible image');
    const pageIdx = parseInt(best.dataset.pageIndex || '0');
    const r = best.getBoundingClientRect();
    const sx = best.naturalWidth / r.width;
    const sy = best.naturalHeight / r.height;
    const data = JSON.stringify({
        galleryId: gid,
        pageIndex: pageIdx + 1,
        x1: Math.round(Math.max(0, -r.left) * sx),
        y1: Math.round(Math.max(0, -r.top) * sy),
        x2: Math.round(Math.min(window.innerWidth - r.left, r.width) * sx),
        y2: Math.round(Math.min(window.innerHeight - r.top, r.height) * sy),
    });
    const res = await new Promise<{ text?: string }>(function (resolve, reject) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://192.168.1.197:11559/api/ocr/hitomi',
            headers: { 'Content-Type': 'application/json' },
            data: data,
            responseType: 'json',
            onload: function (xhr) {
                if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
                    resolve(xhr.response);
                } else reject(new Error('HTTP ' + xhr.status));
            },
            onerror: function () {
                reject(new Error('Network error'));
            },
        });
    });
    if (typeof res.text !== 'string' || !res.text.trim()) {
        throw new Error('No OCR text');
    }
    return {text: res.text.trim(), pageIndex: pageIdx};
}
