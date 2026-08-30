import { defineConfig, loadEnv } from "vite";
import monkey from "vite-plugin-monkey";
import pkg from "./package.json";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const serverUrl = env.VITE_GALLERY_SERVER_URL ?? 'https://192.168.1.197:7777';
    const serverHost = new URL(serverUrl).hostname;

    return {
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
                    grant: ["GM_xmlhttpRequest"],
                    connect: [serverHost],
                },
            }),
        ],
    };
});
