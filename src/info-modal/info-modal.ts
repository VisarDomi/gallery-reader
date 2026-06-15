import {fetchMeta, type HitomiMeta} from '../hitomi/hitomi';


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
    let query = ns + ':' + val.replace(/ /g, '_');
    const lang = (btn.closest('.hs-modal-body') as HTMLElement)?.dataset.hsLang;
    if (lang) query += ' language:' + lang;
    window.location.href = 'https://hitomi.la/search.html?' + encodeURIComponent(query);
}

export async function show(gid: number): Promise<void> {
    const overlay = document.createElement('div');
    overlay.className = 'hs-modal-backdrop';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const content = document.createElement('div');
    content.className = 'hs-modal-content';

    // Loading state
    content.innerHTML = '<div class="hs-modal-body hs-modal-body-loading">Loading...</div>';
    overlay.appendChild(content);
    document.body.appendChild(overlay);


    let meta: HitomiMeta;
    try {
        meta = await fetchMeta(gid);
    } catch {
        content.innerHTML = '<div class="hs-modal-body hs-modal-body-error">Failed to load gallery info</div>';
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
        html += '<div class="hs-modal-row hs-modal-row-tags"><div class="hs-modal-label hs-modal-label-tags">Tags</div><div class="hs-tag-cloud">';
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
    if (meta.language) bodyEl.dataset.hsLang = meta.language;
    bodyEl.onclick = handleSearchClick;
}
