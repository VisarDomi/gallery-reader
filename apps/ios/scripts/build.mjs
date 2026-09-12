import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const app = resolve(root,'apps/ios');
const registry = JSON.parse(await readFile(resolve(app,'providers.json'),'utf8'));
const args = process.argv.slice(2), provider = args.find(arg => !arg.startsWith('--'));
if (!registry[provider] || args.filter(arg => !arg.startsWith('--')).length !== 1 || args.some(arg => arg.startsWith('--') && arg !== '--prepare-only')) {
    throw new Error('Usage: npm run build:ios -- <hitomi|imhentai> [--prepare-only]');
}
const config = registry[provider];
const out = resolve(app,'build',provider,'Web'); await mkdir(out,{recursive:true});
const backupURL = process.env.VITE_READER_BACKUP_URL || 'https://192.168.1.197:7777';
const key = process.env.VITE_READER_BACKUP_KEY || (await readFile(resolve(root,'../gallery-downloader/backups/readers/access-key'),'utf8')).trim();
const define = {__IOS_PROVIDER__:JSON.stringify(provider),__IOS_ORIGIN__:JSON.stringify(config.origin),__READER_BACKUP_URL__:JSON.stringify(backupURL),__READER_BACKUP_KEY__:JSON.stringify(key),'import.meta.env.VITE_GALLERY_SERVER_URL':JSON.stringify(backupURL)};
const providerFile = resolve(root,`src/provider/${provider}/provider.ts`);
const plugin = { name:'native-provider', setup(b) {
    b.onResolve({filter:/./},args => {
        if (args.path === '@selected-provider') return {path:providerFile};
        const path = resolve(args.resolveDir,args.path);
        if ([resolve(root,'src/provider'),resolve(root,'src/provider/index')].includes(path)) return {path:resolve(app,'web/provider.ts')};
        if (path === resolve(root,'src/core/compute/transport')) return {path:resolve(app,'web/transport.ts')};
        if (args.path.endsWith('?inline')) return {path:resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'inline'};
    });
    b.onLoad({filter:/.*/,namespace:'inline'},async args => ({contents:'export default '+JSON.stringify(await readFile(args.path,'utf8')),loader:'js'}));
    b.onLoad({filter:/worker-entry\.ts$/},async args => {
        let source = await readFile(args.path,'utf8');
        source = source.replace(/import \{ provider as hitomi \}[^\n]+\nimport \{ provider as imhentai \}[^\n]+/,`import { provider as selected } from '../../provider/${provider}/data-provider';`)
            .replace("payload.provider === 'hitomi' ? hitomi : imhentai",'selected')
            .replace('const request = event.data;','const request = event.data; if (!("op" in request)) return;');
        return {contents:source,loader:'ts',resolveDir:dirname(args.path)};
    });
}};
const worker = await build({entryPoints:[resolve(app,'web/worker.ts')],bundle:true,write:false,format:'iife',target:'safari17',define,plugins:[plugin]});
await build({entryPoints:[resolve(app,'web/gallery-app.js')],outfile:resolve(out,'app.js'),bundle:true,format:'iife',target:'safari17',define,plugins:[plugin,{name:'worker-source',setup(b){b.onResolve({filter:/^@worker-code$/},()=>({path:'code',namespace:'worker'}));b.onLoad({filter:/.*/,namespace:'worker'},()=>({contents:'export default '+JSON.stringify(worker.outputFiles[0].text),loader:'js'}));}}]});
await writeFile(resolve(out,'style.css'),await readFile(resolve(root,'src/css/style.css'),'utf8')+'\n'+await readFile(resolve(app,'web/gallery.css'),'utf8'));
await copyFile(resolve(app,'web/index.html'),resolve(out,'index.html'));
await writeFile(resolve(app,'build',provider,'provider.xcconfig'),`READER_DISPLAY_NAME = ${config.name}\nREADER_PROVIDER = ${provider}\nPRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId}\nPRODUCT_NAME = ${config.name}\n`);
console.log(`Prepared ${config.name} (${provider})`);
if (!args.includes('--prepare-only')) {
    if (process.platform !== 'darwin') throw new Error('Web bundle prepared. Build/sign on the documented Mac, or use --prepare-only on Linux.');
    const result = spawnSync('bash',[resolve(app,'scripts/build.sh'),provider],{stdio:'inherit'});process.exit(result.status ?? 1);
}
