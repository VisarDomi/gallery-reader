// Packaging only: each repository builds its own independent extension.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const rootURL = new URL('../', import.meta.url);
const root = fileURLToPath(rootURL);
execFileSync(process.execPath, ['scripts/build-extension.mjs'], { cwd: root, stdio: 'inherit' });
for (const [name, path] of [
    ['km-explorer', '../../video/km-explorer/'],
    ['stream-viewer', '../../video/stream-viewer/'],
    ['manga-reader', '../manga-reader/'],
]) {
    const source = new URL(path, rootURL);
    execFileSync(process.execPath, ['scripts/build-extension.mjs'], { cwd: fileURLToPath(source), stdio: 'inherit' });
    const output = new URL(`dist/${name}-extension/`, rootURL);
    mkdirSync(output, { recursive: true });
    for (const file of ['content.js', 'manifest.json']) copyFileSync(new URL('dist/extension/' + file, source), new URL(file, output));
}
console.log('Suite staged: Gallery Reader + KM Explorer + Stream Viewer + Manga Reader. Private artifacts; do not publish.');
