// Default browser behavior. Native builds adapt only cold-launch positioning.
export function positionReader(image: HTMLImageElement): void {
    window.scrollTo(0, image.offsetTop - window.innerHeight / 2);
}
