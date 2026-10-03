import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const src = (path: string) => fileURLToPath(new URL('src/' + path, import.meta.url));
// Unit tests run the app's code with Hitomi as the build-selected provider.
export default defineConfig({
    resolve: { alias: {
        '@selected-provider': src('provider/hitomi/provider.ts'),
        '@selected-data-provider': src('provider/hitomi/data-provider.ts'),
        '@worker-code': fileURLToPath(new URL('tests/unit/stubs/worker-code.ts', import.meta.url)),
    } },
    define: { __IOS_PROVIDER__: '"hitomi"', __IOS_ORIGIN__: '"https://hitomi.la"', __READER_BACKUP_URL__: '""', __READER_BACKUP_KEY__: '""' },
    test: { include: ['tests/unit/**/*.test.ts'] },
});
