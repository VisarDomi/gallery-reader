export function takeOverDocument(): void {
    window.stop();
    document.open();
    document.close();
}
