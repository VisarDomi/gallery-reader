import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";
import pkg from "./package.json";

export default defineConfig({
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
                name: `hitomi v${pkg.version}`,
                namespace: "https://github.com/visar",
                description: "Hitomi/Exhentai gallery browser with OCR",
                match: ["https://hitomi.la/*"],
                connect: ["192.168.1.197"],
                grant: ["GM.xmlHttpRequest", "GM.getValue", "GM.setValue", "GM.deleteValue", "GM.listValues"],
                "run-at": "document-start",
            },
        }),
    ],
});
