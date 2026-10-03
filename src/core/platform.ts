// Let WebKit restore history navigations. Only a newly opened reader uses the
// shared source's initial image positioning.
let restoring = false;
export function receive(state: {restoring?: boolean}) { restoring = Boolean(state.restoring); }
export function positionReader(image: HTMLImageElement) {
    if (!restoring) scrollTo(0, image.offsetTop - innerHeight / 2);
}
