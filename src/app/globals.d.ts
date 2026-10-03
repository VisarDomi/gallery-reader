declare const __IOS_PROVIDER__: string;
declare const __IOS_ORIGIN__: string;
declare module '@worker-code' { const source: string; export default source; }
declare module '@selected-provider' { export const provider: import('../provider/types').Provider; }
interface Window {
    webkit: {messageHandlers:{gallery:{postMessage(request: unknown): Promise<string>}}};
}
declare module '@selected-data-provider' { export const provider: typeof import('../provider/hitomi/data-provider').provider; }
interface ImportMeta { readonly env: { readonly VITE_GALLERY_SERVER_URL?: string } }
