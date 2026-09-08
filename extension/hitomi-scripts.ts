import { detachJQueryFromSuggestionLinks as detach, setupDropdownHandler as setup } from '../src/provider/hitomi/script';
import { DOMAIN } from '../src/provider/hitomi/constants';

declare const __READER_SCRIPT_NONCE__: string;

// This is intentionally the same post-stop/open/close sequence as the userscript.
// Never allow a URL supplied by the original document to become executable.
export function loadScript(filename: string): Promise<void> {
    if (!['jquery.min.js', 'common.js', 'searchlib.js', 'search.js'].includes(filename)) throw new Error('Unexpected Hitomi script');
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.nonce = __READER_SCRIPT_NONCE__;
        script.src = `https://ltn.${DOMAIN}/${filename}`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Could not load Hitomi script: ${filename}`));
        document.head.appendChild(script);
    });
}

export const detachJQueryFromSuggestionLinks = detach;
export const setupDropdownHandler = setup;
