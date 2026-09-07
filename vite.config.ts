import { defineConfig, loadEnv } from "vite";
import monkey from "vite-plugin-monkey";
import pkg from "./package.json";
import { readFileSync } from 'node:fs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const serverUrl = env.VITE_GALLERY_SERVER_URL ?? 'https://192.168.1.197:7777';
    const serverHost = new URL(serverUrl).hostname;
    const backupUrl = env.VITE_READER_BACKUP_URL ?? serverUrl;
    const backupKey = env.VITE_READER_BACKUP_KEY || readFileSync(new URL('../gallery-downloader/backups/readers/access-key', import.meta.url), 'utf8').trim();

    return {
        define: { __READER_BACKUP_URL__: JSON.stringify(backupUrl), __READER_BACKUP_KEY__: JSON.stringify(backupKey) },
        build: {
            minify: false,
            sourcemap: false,
            target: "esnext",
            modulePreload: false,
            cssCodeSplit: false,
        },
        plugins: [
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
