import { fetchMeta, imageUrl, readerUrl } from '../provider';
import {cleanDocument} from "../ui/shell";

const setSrc = (i: number, src: string) => {
    const img = document.getElementById(`#${i}`) as HTMLImageElement;
    img.src = src;
};

async function applyImageSources(files: { hash: string; name: string; width: number; height: number }[], gid: number, index: number) {
    const promises: Promise<string>[] = files.map((_, i) => imageUrl(gid, i));

    const currIndex = index;
    promises[currIndex].then((src: string) => setSrc(currIndex, src));
    const prevIndex = currIndex - 1;
    if (prevIndex >= 0) promises[prevIndex].then((src: string) => setSrc(prevIndex, src));
    const nextIndex = currIndex + 1;
    if (nextIndex < files.length) promises[nextIndex].then((src: string) => setSrc(nextIndex, src));

    const sources = await Promise.all(promises);
    sources.forEach((source: string, i: number) => setSrc(i, source));
}

export async function open(gid: number, index: number): Promise<void> {
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

    const restoreImg = document.getElementById(`#${index}`) as HTMLImageElement;
    const maxST = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, Math.min(maxST, restoreImg.offsetTop - window.innerHeight / 2)));

    void applyImageSources(files, gid, index);

    window.addEventListener('scrollend', () => {
        setTimeout(() => {
            const saveImg = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2 + 1) as HTMLImageElement;
            const index = parseInt(saveImg.id.split("#")[1]);
            history.replaceState(null, '', readerUrl(gid, index));
        }, 100);
    });
}
