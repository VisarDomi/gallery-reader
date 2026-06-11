export type OcrPhase = 'idle' | 'ocr' | 'opening' | 'failed';

export interface OcrButton {
    btn: HTMLButtonElement;
    setPhase: (p: OcrPhase) => void;
    show: () => void;
    hide: () => void;
}

export function createButton(): OcrButton {
    const btn = document.createElement('button');
    btn.className = 'hs-ocr-fab';
    setPhase(btn, 'idle');
    btn.style.display = 'none';
    document.body.appendChild(btn);
    return {
        btn,
        setPhase: function (p: OcrPhase) {
            setPhase(btn, p);
        },
        show: function () {
            btn.style.display = 'flex';
        },
        hide: function () {
            btn.style.display = 'none';
        },
    };
}

function setPhase(btn: HTMLButtonElement, phase: OcrPhase): void {
    btn.classList.remove('hs-ocr-fab--failed');
    switch (phase) {
        case 'idle':
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M8 9h8M8 12h8M8 15h5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>';
            break;
        case 'ocr':
            btn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" opacity="0.3" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.4"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>';
            break;
        case 'opening':
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>';
            break;
        case 'failed':
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01M10.3 3.9 2.9 16.5A1 1 0 0 0 3.8 18h16.4a1 1 0 0 0 .9-1.5L13.7 3.9a1 1 0 0 0-1.7 0Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>';
            btn.classList.add('hs-ocr-fab--failed');
            break;
    }
}
