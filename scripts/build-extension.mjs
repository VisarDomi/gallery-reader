import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extensionManifest, extensionRules } from '../extension/config.mjs';
import { randomBytes } from 'node:crypto';

const nonce = randomBytes(32).toString('base64');
execFileSync('npx', ['vite', 'build', '--mode', 'extension'], { stdio: 'inherit', env: { ...process.env, READER_EXTENSION_NONCE: nonce } });
const directory = 'dist/extension';
const file = `${directory}/content.js`;
const source = readFileSync(file, 'utf8');
const revoke = '"(self.URL || self.webkitURL).revokeObjectURL(self.location.href);",';
if (!source.includes(revoke)) throw new Error('Vite inline-worker wrapper changed; inspect before shipping');
writeFileSync(file, source.replaceAll(revoke, '"",'));
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync(`${directory}/manifest.json`, JSON.stringify(extensionManifest(version), null, 2) + '\n');
writeFileSync(`${directory}/rules.json`, JSON.stringify(extensionRules(nonce), null, 2) + '\n');
console.log('Private extension built: dist/extension (contains the PC backup key; do not publish).');
