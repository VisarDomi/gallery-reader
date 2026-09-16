export function takeOverDocument(): void {
    document.body.replaceChildren();
    document.querySelector('meta[name="viewport"]')?.remove();
}
