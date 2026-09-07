import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

if (!process.argv.includes('--no-increase-version')) execFileSync(process.execPath, ['increase.js'], { stdio: 'inherit' });
execFileSync('npx', ['vite', 'build'], { stdio: 'inherit' });
// Match Manga Reader's inline-worker handling: do not revoke the worker script
// URL from within its own script while WebKit may still be loading it.
const file = 'dist/gallery-reader.user.js';
const source = readFileSync(file, 'utf8');
const revoke = '"(self.URL || self.webkitURL).revokeObjectURL(self.location.href);",';
if (!source.includes(revoke)) throw new Error('Vite inline-worker wrapper changed; inspect before shipping');
writeFileSync(file, source.replaceAll(revoke, '"",'), 'utf8');
