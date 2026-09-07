import {getReaderData, imageUrls, readerUrl} from '../provider';
import {registerImage} from '../core/image-retry';

export async function open(gid: number, currentIndex: number): Promise<void> {
    const wrapper = document.createElement('div');
    wrapper.className = 'hs-reader-body';
    document.body.appendChild(wrapper);
    const { images } = await getReaderData(gid);
    if (!images.length) { wrapper.textContent = 'This gallery has no readable images.'; return; }
    for (let i = 0; i < images.length; i++) {
        const img = document.createElement('img');
        img.id = `#${i}`;
        img.className = 'hs-reader-img';
        img.style.aspectRatio = images[i].width + '/' + images[i].height;
        img.loading = 'lazy';
        wrapper.appendChild(img);
        if (i % 32 === 31) await new Promise(resolve => setTimeout(resolve, 0));
    }

    const safeIndex = Math.max(0, Math.min(Number.isSafeInteger(currentIndex) ? currentIndex : 0, images.length - 1));
    const restoreImg = document.getElementById(`#${safeIndex}`) as HTMLImageElement;
    window.scrollTo(0, restoreImg.offsetTop - window.innerHeight / 2);

    const urls = await imageUrls(images);
    urls.forEach((src, i) => {
        const img = document.getElementById(`#${i}`) as HTMLImageElement;
        img.src = src;
        // Register only once the source exists: the registry drops empty-src
        // images on its first tick.
        registerImage(img);
    });

    window.addEventListener('scrollend', () => {
        setTimeout(() => {
            const saveImg = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2 + 1) as HTMLImageElement;
            const index = parseInt(saveImg.id.split("#")[1]);
            history.replaceState(null, '', readerUrl(gid, index));
        }, 100);
    });
}
