// Let WebKit restore history navigations. Only a newly opened reader uses the
// shared source's initial image positioning.
let restoring = false;
export function receive(state: {restoring?: boolean}) { restoring = Boolean(state.restoring); }
// A newly opened reader puts the image's top at the screen's centre; a reloaded one (iOS ended
// the page in the background) puts the same point of the image there as before.
export function positionReader(image: HTMLImageElement, fraction = 0) {
    if (!restoring) scrollTo(0, image.offsetTop + fraction * image.offsetHeight - innerHeight / 2);
}
