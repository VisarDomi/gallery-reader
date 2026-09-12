declare const __IOS_PROVIDER__: string;
declare const __IOS_ORIGIN__: string;
declare module '@worker-code' { const source: string; export default source; }
declare module '@selected-provider' { export const provider: import('../../../src/provider/types').Provider; }
interface Window {
    webkit: {messageHandlers:{gallery:{postMessage(request: unknown): Promise<string>}}};
    nativeGallery: any;
    galleryViewState: any;
}
