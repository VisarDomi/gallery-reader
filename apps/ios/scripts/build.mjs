import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { providerSettings } from './provider-settings.mjs';

// Prepares one provider's build settings (build/<provider>/provider.xcconfig): its name,
// bundle ID, and the PC: this repository's backup server with its access key, and the public
// addresses both servers have away from home, with the favorites server's key there. The keys
// stay out of Git, in the ignored build folder; they are read from their files, never printed.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(await readFile(resolve(app, 'providers.json'), 'utf8'));
const args = process.argv.slice(2), provider = args.find(arg => !arg.startsWith('--'));
if (!registry[provider] || args.filter(arg => !arg.startsWith('--')).length !== 1 || args.some(arg => arg.startsWith('--') && arg !== '--prepare-only')) {
    throw new Error('Usage: npm run build:ios -- <hitomi|imhentai> [--prepare-only]');
}
const config = registry[provider];
// A key from its file under the home folder, unless the environment gives it.
const secret = async (override, file) => override || (await readFile(resolve(homedir(), file), 'utf8').catch(error => {
    throw new Error(`Cannot read ~/${file} (${error.code}). The build needs this key: see apps/ios/README.md ("The PC").`);
})).trim();
await mkdir(resolve(app, 'build', provider), { recursive: true });
await writeFile(resolve(app, 'build', provider, 'provider.xcconfig'), providerSettings(provider, config, {
    backupURL: process.env.VITE_READER_BACKUP_URL || 'https://192.168.1.197:7722',
    backupKey: await secret(process.env.VITE_READER_BACKUP_KEY, '.local/share/gallery-reader/backups/access-key'),
    backupPublicURL: process.env.VITE_READER_BACKUP_PUBLIC_URL || 'https://pc-apps.veron3.space/gallery-backups',
    favoritesPublicURL: process.env.VITE_READER_FAVORITES_PUBLIC_URL || 'https://pc-apps.veron3.space/gallery',
    favoritesKey: await secret(process.env.VITE_READER_FAVORITES_KEY, '.local/share/hetzner-pc/keys/gallery-favorites.key'),
}));
console.log(`Prepared ${config.name} (${provider})`);
if (!args.includes('--prepare-only')) {
    if (process.platform !== 'darwin') throw new Error('Settings prepared. Build/sign on the documented Mac, or use --prepare-only on Linux.');
    const result = spawnSync('bash', [resolve(app, 'scripts/build.sh'), provider], { stdio: 'inherit' });
    process.exit(result.status ?? 1);
}
