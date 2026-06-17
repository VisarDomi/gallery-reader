import {fetchMeta, imageUrl} from '../provider';
import {cleanDocument} from "../ui/shell";

const setSrc = (i: number, src: string) => {
    const img = document.getElementById(`#${i}`) as HTMLImageElement;
    img.src = src;
};

async function applyImageSources(files: { hash: string; name: string; width: number; height: number }[], gid: number, restoreHash: string) {
    const promises = files.map((_, i) => imageUrl(gid, i));

    const currIndex = Number(restoreHash.split("#")[1]);
    promises[currIndex].then(src => setSrc(currIndex, src));
    const prevIndex = currIndex - 1;
    if (prevIndex >= 0) promises[prevIndex].then(src => setSrc(prevIndex, src));
    const nextIndex = currIndex + 1;
    if (nextIndex < files.length) promises[nextIndex].then(src => setSrc(nextIndex, src));

    const sources = await Promise.all(promises);
    sources.forEach((source, i) => setSrc(i, source));
}

export async function open(gid: number, restoreHash: string): Promise<void> {
    cleanDocument();
    const meta = await fetchMeta(gid);
    const files = meta.files;
    for (let index = 0; index < files.length; index++) {
        const img = document.createElement('img');
        img.id = `#${index}`; // hash
        img.className = 'hs-reader-img';
        img.style.aspectRatio = files[index].width + '/' + files[index].height;
        img.loading = 'lazy';
        document.body.appendChild(img);
    }

    const restoreImg = document.getElementById(restoreHash) as HTMLImageElement;
    const maxST = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, Math.min(maxST, restoreImg.offsetTop - window.innerHeight / 2)));

    await applyImageSources(files, gid, restoreHash);

    window.addEventListener('scrollend', () => {
        setTimeout(() => {
            const saveImg = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) as HTMLImageElement;
            const saveHash = saveImg.id;
            if (window.location.hash !== saveHash) history.replaceState(null, '', saveHash);
        }, 100);
    });
}
