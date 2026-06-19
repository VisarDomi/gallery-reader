import {fetchMeta, type GalleryFile, imageUrls, readerUrl} from '../provider';
import {cleanDocument} from "../ui/shell";

const setSrc = (i: number, src: string) => {
    const img = document.getElementById(`#${i}`) as HTMLImageElement;
    img.src = src;
};

async function applyImageSources(files: GalleryFile[], currentIndex: number) {
    const urls = await imageUrls(files);

    // Generate pingpong index sequence: current, prev, next, prevPrev, nextNext, ...
    const order: number[] = [];
    order.push(currentIndex);
    for (let i = 1; i < files.length; i++) {
        const prev = currentIndex - i;
        const next = currentIndex + i;
        if (prev >= 0) order.push(prev);
        if (next < files.length) order.push(next);
    }

    // Resolve sequentially in pingpong order
    for (const i of order) {
        setSrc(i, urls[i]);
    }
}

export async function open(gid: number, currentIndex: number): Promise<void> {
    cleanDocument();
    const meta = await fetchMeta(gid);
    const files = meta.files;
    for (let i = 0; i < files.length; i++) {
        const img = document.createElement('img');
        img.id = `#${i}`;
        img.className = 'hs-reader-img';
        img.style.aspectRatio = files[i].width + '/' + files[i].height;
        img.loading = 'lazy';
        document.body.appendChild(img);
    }

    const restoreImg = document.getElementById(`#${currentIndex}`) as HTMLImageElement;
    const maxST = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, Math.min(maxST, restoreImg.offsetTop - window.innerHeight / 2)));

    void applyImageSources(files, currentIndex);

    window.addEventListener('scrollend', () => {
        setTimeout(() => {
            const saveImg = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2 + 1) as HTMLImageElement;
            const index = parseInt(saveImg.id.split("#")[1]);
            history.replaceState(null, '', readerUrl(gid, index));
        }, 100);
    });
}
