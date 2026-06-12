import {fetchMeta, imageUrl} from '../hitomi/hitomi';

async function applySrc(files: { hash: string; name: string; width: number; height: number }[], gid: number) {
    const sources = await Promise.all(
        files.map((_, idx) => imageUrl(gid, idx))
    );

    sources.forEach((source, index) => {
        const img = document.getElementById(`#${index}`) as HTMLImageElement;
        img.src = source;
    });
}

export async function open(gid: number, hash: string): Promise<void> {
    document.documentElement.innerHTML = ''; // TODO: expand this into a proper reader cleanup function.
    document.body.style.background = '#000';
    document.body.style.margin = '0';
    document.body.style.fontSize = '16px';
    document.body.style.setProperty('overflow', 'visible', 'important');
    document.documentElement.style.scrollBehavior = 'auto';

    const meta = await fetchMeta(gid);
    const files = meta.files;
    for (let index = 0; index < files.length; index++) {
        const img = document.createElement('img');
        img.id = `#${index}`; // hash
        img.style.display = 'block';
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.aspectRatio = files[index].width + '/' + files[index].height;
        img.loading = 'lazy';
        document.body.appendChild(img);
    }

    const restoreImg = document.getElementById(hash) as HTMLImageElement;
    const maxST = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, Math.min(maxST, restoreImg.offsetTop - window.innerHeight / 2)));


    // await applySrc(files, gid);

    window.addEventListener('scrollend', () => {
        setTimeout(() => {
            const img = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) as HTMLImageElement;
            const hash = img.id;
            if (window.location.hash !== hash) history.replaceState(null, '', hash);
        }, 100);
    });
}
