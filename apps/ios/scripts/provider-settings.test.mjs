import test from 'node:test';
import assert from 'node:assert/strict';
import { providerSettings } from './provider-settings.mjs';

const config = { name: 'Hitomi', bundleId: 'com.visar.HitomiReader.paid' };
const pc = {
    backupURL: 'https://192.168.1.197:7722', backupKey: 'abc123',
    backupPublicURL: 'https://pc-apps.example/gallery-backups', favoritesPublicURL: 'https://pc-apps.example/gallery/',
    favoritesKey: 'k-_.~+/=9',
};

test('the settings carry both servers, at home and away', () => {
    assert.equal(providerSettings('hitomi', config, pc), [
        'READER_DISPLAY_NAME = Hitomi', 'READER_PROVIDER = hitomi', 'PRODUCT_BUNDLE_IDENTIFIER = com.visar.HitomiReader.paid',
        'PRODUCT_NAME = Hitomi', 'READER_BACKUP_URL = https:/$()/192.168.1.197:7722', 'READER_BACKUP_KEY = abc123',
        'READER_BACKUP_PUBLIC_URL = https:/$()/pc-apps.example/gallery-backups',
        'READER_FAVORITES_PUBLIC_URL = https:/$()/pc-apps.example/gallery', 'READER_FAVORITES_KEY = k-_.~+/=9', ''].join('\n'));
});

test('a key with "//" survives xcconfig comments', () => {
    assert.match(providerSettings('hitomi', config, { ...pc, favoritesKey: 'ab//cd' }), /^READER_FAVORITES_KEY = ab\/\$\(\)\/cd$/m);
});

test('a key a build setting cannot carry is refused without being shown', () => {
    for (const bad of ['', 'two words', 'line\nbreak', 'dollar$(X)', 'quote"', undefined]) {
        for (const field of ['backupKey', 'favoritesKey']) {
            assert.throws(() => providerSettings('hitomi', config, { ...pc, [field]: bad }), error => {
                assert.match(error.message, /key is empty or has characters/);
                if (bad) assert.ok(!error.message.includes(bad));
                return true;
            });
        }
    }
});

test('a public address must be plain https', () => {
    for (const bad of ['http://pc-apps.example/gallery', 'https://user:pass@pc-apps.example/x', 'https://pc-apps.example/x?y=1', 'nonsense', 'https://pc-apps.example/$(X)']) {
        assert.throws(() => providerSettings('hitomi', config, { ...pc, backupPublicURL: bad }), /public backup address/);
        assert.throws(() => providerSettings('hitomi', config, { ...pc, favoritesPublicURL: bad }), /public favorites address/);
    }
});
