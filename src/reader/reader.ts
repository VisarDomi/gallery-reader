import {fetchMeta, imageUrl} from '../hitomi/hitomi';
import {cleanDocument} from "../shared/shell";

async function applySrc(files: { hash: string; name: string; width: number; height: number }[], gid: number, restoreHash: string) {
    const promises = files.map((_, i) => imageUrl(gid, i));

    const prevIndex = Number(restoreHash.split("#")[1]) - 1;
    const currIndex = Number(restoreHash.split("#")[1]);
    promises[currIndex].then(src => {
        const img = document.getElementById(`#${currIndex}`) as HTMLImageElement;
        img.src = src;
    });
    if (prevIndex>=0) {
        promises[prevIndex].then(src => {
            const img = document.getElementById(`#${prevIndex}`) as HTMLImageElement;
            img.src = src;
        });
    }

    const sources = await Promise.all(
        files.map((_, index) => imageUrl(gid, index))
    );

    sources.forEach((source, index) => {
        const img = document.getElementById(`#${index}`) as HTMLImageElement;
        img.src = source;
    });
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

    await applySrc(files, gid, restoreHash);

    window.addEventListener('scrollend', () => {
        setTimeout(() => {
            const saveImg = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) as HTMLImageElement;
            const saveHash = saveImg.id;
            if (window.location.hash !== saveHash) history.replaceState(null, '', saveHash);
        }, 100);
    });
}
