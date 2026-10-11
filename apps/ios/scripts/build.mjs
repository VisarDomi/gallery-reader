import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

// Prepares one provider's build settings (build/<provider>/provider.xcconfig): its name,
// bundle ID, and the PC: Gallery Downloader's favorites server and this repository's backup
// server with its access key (which stays out of Git, in the ignored build folder).
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(await readFile(resolve(app, 'providers.json'), 'utf8'));
const args = process.argv.slice(2), provider = args.find(arg => !arg.startsWith('--'));
if (!registry[provider] || args.filter(arg => !arg.startsWith('--')).length !== 1 || args.some(arg => arg.startsWith('--') && arg !== '--prepare-only')) {
    throw new Error('Usage: npm run build:ios -- <hitomi|imhentai> [--prepare-only]');
}
const config = registry[provider];
const backupURL = process.env.VITE_READER_BACKUP_URL || 'https://192.168.1.197:7722';
const key = process.env.VITE_READER_BACKUP_KEY || (await readFile(resolve(homedir(), '.local/share/gallery-reader/backups/access-key'), 'utf8')).trim();
// xcconfig treats "//" as a comment: "/$()/" keeps URLs whole.
const escape = value => value.replaceAll('//', '/$()/');
await mkdir(resolve(app, 'build', provider), { recursive: true });
await writeFile(resolve(app, 'build', provider, 'provider.xcconfig'), [
    `READER_DISPLAY_NAME = ${config.name}`, `READER_PROVIDER = ${provider}`, `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId}`,
    `PRODUCT_NAME = ${config.name}`, `READER_BACKUP_URL = ${escape(backupURL)}`, `READER_BACKUP_KEY = ${key}`, ''].join('\n'));
console.log(`Prepared ${config.name} (${provider})`);
if (!args.includes('--prepare-only')) {
    if (process.platform !== 'darwin') throw new Error('Settings prepared. Build/sign on the documented Mac, or use --prepare-only on Linux.');
    const result = spawnSync('bash', [resolve(app, 'scripts/build.sh'), provider], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
}
