import {fetchMeta, type HitomiMeta} from '../hitomi/hitomi';

const CSS = '.hs-modal-backdrop{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:2000;display:flex;justify-content:center;align-items:center}' +
    '.hs-modal-content{background:#1e1e1e;color:#eee;padding:24px;border-radius:12px;width:90%;max-width:500px;max-height:85vh;overflow-y:auto;border:1px solid #333;box-shadow:0 10px 40px rgba(0,0,0,0.8)}' +
    '.hs-modal-header h2{margin:0;font-size:1.2rem;line-height:1.4;color:#fff}' +
    '.hs-modal-body{display:flex;flex-direction:column;gap:12px;font-size:0.95rem;margin-top:16px}' +
    '.hs-modal-row{display:flex;border-bottom:1px solid #333;padding-bottom:8px}' +
    '.hs-modal-label{flex:0 0 80px;color:#888;font-weight:500}' +
    '.hs-modal-value{flex:1;color:#ddd}' +
    '.hs-modal-value-link{color:#fff;text-decoration:underline;cursor:pointer}' +
    '.hs-modal-value-link:active{color:#4af626}' +
    '.hs-tag-cloud{display:flex;flex-wrap:wrap;gap:6px}' +
    '.hs-tag-chip{background:#333;color:#ccc;padding:3px 8px;border-radius:4px;font-size:0.85rem;cursor:pointer;border:none}' +
    '.hs-tag-chip:active{color:#4af626;background:#444}' +
    '.hs-modal-footer{margin-top:16px;display:flex;justify-content:flex-end}' +
    '.hs-modal-ok-btn{background:#333;color:#fff;border:none;padding:8px 24px;border-radius:6px;font-size:0.95rem;cursor:pointer}';

function escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleSearchClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest<HTMLElement>('[data-hs-ns][data-hs-val]');
    if (!btn) return;
    const ns = btn.dataset.hsNs;
    const val = btn.dataset.hsVal;
    if (!ns || !val) return;
    window.location.href = 'https://hitomi.la/search.html?' + ns + '%3A' + encodeURIComponent(val);
}

export async function show(gid: number): Promise<void> {
    const overlay = document.createElement('div');
    overlay.className = 'hs-modal-backdrop';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const content = document.createElement('div');
    content.className = 'hs-modal-content';

    // Loading state
    content.innerHTML = '<div class="hs-modal-body" style="text-align:center;padding:2rem">Loading...</div>';
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Inject CSS once
    if (!document.getElementById('hs-modal-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'hs-modal-style';
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
    }

    let meta: HitomiMeta;
    try {
        meta = await fetchMeta(gid);
    } catch {
        content.innerHTML = '<div class="hs-modal-body" style="text-align:center;padding:2rem;color:#f44">Failed to load gallery info</div>';
        return;
    }

    let html = '<div class="hs-modal-header">';
    if (meta.title_jpn) html += '<h2>' + escapeHTML(meta.title_jpn) + '</h2>';
    html += '<h2>' + escapeHTML(meta.title) + '</h2></div>';

    html += '<div class="hs-modal-body">';

    if (meta.artists.length > 0) {
        html += '<div class="hs-modal-row"><span class="hs-modal-label">Artist</span><span class="hs-modal-value">';
        for (let i = 0; i < meta.artists.length; i++) {
            if (i > 0) html += ', ';
            html += '<span class="hs-modal-value-link" data-hs-ns="artist" data-hs-val="' + escapeHTML(meta.artists[i]) + '">' + escapeHTML(meta.artists[i]) + '</span>';
        }
        html += '</span></div>';
    }

    if (meta.groups.length > 0) {
        html += '<div class="hs-modal-row"><span class="hs-modal-label">Group</span><span class="hs-modal-value">';
        for (let i = 0; i < meta.groups.length; i++) {
            if (i > 0) html += ', ';
            html += '<span class="hs-modal-value-link" data-hs-ns="group" data-hs-val="' + escapeHTML(meta.groups[i]) + '">' + escapeHTML(meta.groups[i]) + '</span>';
        }
        html += '</span></div>';
    }

    if (meta.parody.length > 0) {
        html += '<div class="hs-modal-row"><span class="hs-modal-label">Series</span><span class="hs-modal-value">';
        for (let i = 0; i < meta.parody.length; i++) {
            if (i > 0) html += ', ';
            html += '<span class="hs-modal-value-link" data-hs-ns="series" data-hs-val="' + escapeHTML(meta.parody[i]) + '">' + escapeHTML(meta.parody[i]) + '</span>';
        }
        html += '</span></div>';
    }

    if (meta.type) {
        html += '<div class="hs-modal-row"><span class="hs-modal-label">Type</span><span class="hs-modal-value">';
        html += '<span class="hs-modal-value-link" data-hs-ns="type" data-hs-val="' + escapeHTML(meta.type) + '">' + escapeHTML(meta.type) + '</span>';
        html += '</span></div>';
    }

    if (meta.characters.length > 0) {
        html += '<div class="hs-modal-row"><span class="hs-modal-label">Characters</span><span class="hs-modal-value">';
        for (let i = 0; i < meta.characters.length; i++) {
            if (i > 0) html += ', ';
            html += '<span class="hs-modal-value-link" data-hs-ns="character" data-hs-val="' + escapeHTML(meta.characters[i]) + '">' + escapeHTML(meta.characters[i]) + '</span>';
        }
        html += '</span></div>';
    }

    if (meta.language) {
        html += '<div class="hs-modal-row"><span class="hs-modal-label">Language</span><span class="hs-modal-value">';
        html += '<span class="hs-modal-value-link" data-hs-ns="language" data-hs-val="' + escapeHTML(meta.language) + '">' + escapeHTML(meta.language) + '</span>';
        html += '</span></div>';
    }
    html += '<div class="hs-modal-row"><span class="hs-modal-label">Pages</span><span class="hs-modal-value">' + meta.files.length + '</span></div>';

    if (meta.date) {
        html += '<div class="hs-modal-row"><span class="hs-modal-label">Date</span><span class="hs-modal-value">' + escapeHTML(meta.date) + '</span></div>';
    }

    if (meta.tags.length > 0) {
        html += '<div class="hs-modal-row" style="display:block;border:none"><div class="hs-modal-label" style="margin-bottom:6px">Tags</div><div class="hs-tag-cloud">';
        for (let i = 0; i < meta.tags.length; i++) {
            const t = meta.tags[i];
            const fullTag = (t.female ? 'female:' : t.male ? 'male:' : '') + t.tag;
            html += '<span class="hs-tag-chip" data-hs-ns="' + (t.female ? 'female' : t.male ? 'male' : 'tag') + '" data-hs-val="' + escapeHTML(t.tag) + '">' + escapeHTML(fullTag) + '</span>';
        }
        html += '</div></div>';
    }

    html += '</div>'; // body

    html += '<div class="hs-modal-footer"><button class="hs-modal-ok-btn">Close</button></div>';

    content.innerHTML = html;

    // Wire up close button
    const okBtn = content.querySelector('.hs-modal-ok-btn') as HTMLButtonElement;
    okBtn.onclick = () => overlay.remove();

    // Wire up search clicks on the body
    const bodyEl = content.querySelector('.hs-modal-body') as HTMLElement;
    bodyEl.onclick = handleSearchClick;
}
