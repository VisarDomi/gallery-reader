import { defineConfig, loadEnv } from "vite";
import monkey from "vite-plugin-monkey";
import pkg from "./package.json";
import { readFileSync } from 'node:fs';

export default defineConfig(({ mode }) => {
    const extension = mode === 'extension';
    const env = loadEnv(mode, process.cwd(), '');
    const serverUrl = env.VITE_GALLERY_SERVER_URL ?? 'https://192.168.1.197:7777';
    const serverHost = new URL(serverUrl).hostname;
    const backupUrl = env.VITE_READER_BACKUP_URL ?? serverUrl;
    const backupKey = env.VITE_READER_BACKUP_KEY || readFileSync(new URL('../gallery-downloader/backups/readers/access-key', import.meta.url), 'utf8').trim();

    return {
        define: {
            __READER_BACKUP_URL__: JSON.stringify(backupUrl), __READER_BACKUP_KEY__: JSON.stringify(backupKey),
            ...(extension ? {
                __READER_TAKEOVER_MODE__: JSON.stringify(process.env.READER_TAKEOVER_MODE || 'guarded-replace'),
                __READER_PERFORMANCE_PROBE__: JSON.stringify(process.env.READER_PERFORMANCE_PROBE === '1'),
            } : {}),
        },
        build: {
            emptyOutDir: extension,
            ...(extension ? {
                outDir: 'dist/extension',
                lib: { entry: 'extension/main.ts', name: 'GalleryReader', formats: ['iife' as const], fileName: () => 'content.js' },
            } : {}),
            minify: false,
            sourcemap: false,
            target: "esnext",
            modulePreload: false,
            cssCodeSplit: false,
        },
        plugins: extension ? [{
            name: 'extension-document-takeover',
            enforce: 'pre',
            transform(source, id) {
                if (!id.endsWith('/src/ui/shell.ts')) return;
                const mode = process.env.READER_TAKEOVER_MODE || 'guarded-replace';
                if (mode === 'guarded-stop') return;
                if (mode === 'guarded-open') return source.replace('window.stop();', '/* document.open replaces the original parser */');
                if (mode === 'guarded-replace') return source.replace('document.open();\n    document.close();', 'document.documentElement?.replaceChildren();');
                if (mode === 'guarded-write') return source.replace('document.open();\n    document.close();', `document.open();
    document.write('<!doctype html><html><head></head><body></body></html>');
    document.close();`);
                if (mode === 'guarded-deferred-close') return source.replace('document.open();\n    document.close();', `document.open();
    document.write('<!doctype html><html><head></head><body></body></html>');
    setTimeout(() => document.close(), 0);`);
                throw new Error('Unknown takeover experiment: ' + mode);
            },
        }] : [
            monkey({
                entry: "src/main.ts",
                userscript: {
                    name: `${pkg.name} v${pkg.version}`,
                    namespace: "https://github.com/VisarDomi",
                    description: "gallery reader takeover",
                    match: ["https://hitomi.la/*", "https://imhentai.xxx/*"],
                    "run-at": "document-start",
                    connect: [...new Set([serverHost, new URL(backupUrl).hostname])],
                },
            }),
        ],
    };
});
