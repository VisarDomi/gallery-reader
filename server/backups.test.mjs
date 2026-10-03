import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BackupStore, handler } from './backups.mjs';

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-backup-test-'));
    return { root, store: new BackupStore(root), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const data = ids => ({ version: 1, indexedDB: { favorites: ids, searches: [], page: 1, scroll: {} } });

test('isolated phones/providers; exactly current and previous; idempotent retries', () => {
    const { root, store, cleanup } = fixture();
    try {
        const id = randomUUID();
        const put = (ids, baseRevision) => store.put('hitomi', id, { label: 'iPhone', data: data(ids), baseRevision });
        const first = put([1], null);
        assert.equal(first.previous, null);
        assert.deepEqual(put([1], null), first);
        const second = put([1, 2], first.current.revision);
        const third = put([1, 2, 3], second.current.revision);
        assert.deepEqual(third.previous, second.current);
        assert.equal(Object.keys(third).length, 4);
        assert.throws(() => put([], first.current.revision), /CONFLICT/);
        assert.throws(() => put([], third.current.revision), /local data is now empty/);
        assert.deepEqual(store.read('hitomi', id), third);
        const copy = store.put('hitomi', randomUUID(), { label: 'Restored phone', data: third.current.data, baseRevision: null });
        assert.notEqual(copy.id, id);
        assert.equal(store.list('hitomi').length, 2);
        assert.equal(store.list('imhentai').length, 0);
        assert.equal(fs.statSync(store.file('hitomi', id)).mode & 0o777, 0o600);
        assert.equal(fs.statSync(root).mode & 0o777, 0o700);
        assert.equal(fs.readdirSync(store.directory('hitomi')).length, 2);
        assert.deepEqual(new BackupStore(root).read('hitomi', id), third);
    } finally { cleanup(); }
});

test('invalid providers, IDs and snapshots are rejected', () => {
    const { store, cleanup } = fixture();
    try {
        assert.throws(() => store.list('../elsewhere'));
        assert.throws(() => store.list('asurascans'));
        assert.throws(() => store.read('hitomi', '../secret'));
        assert.throws(() => store.put('hitomi', randomUUID(), { label: 'Phone', data: null, baseRevision: null }));
    } finally { cleanup(); }
});

test('HTTP backups require the private key and never cache', async t => {
    const { root, cleanup } = fixture();
    const server = http.createServer(handler(root)).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); cleanup(); });
    const base = `http://127.0.0.1:${server.address().port}/api/reader-backups/gallery-reader/hitomi`;
    const denied = await fetch(base);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('cache-control'), 'no-store');
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(base, { headers: { Origin: 'https://hitomi.la' } })).headers.get('access-control-allow-origin'), null);
    const headers = { 'X-Reader-Backup-Key': fs.readFileSync(path.join(root, 'access-key'), 'utf8'), 'Content-Type': 'application/json' };
    const saved = await fetch(base + '/' + randomUUID(), { method: 'PUT', headers, body: JSON.stringify({ label: 'Phone', baseRevision: null, data: data([7, 8]) }) });
    assert.equal(saved.status, 200);
    assert.equal((await (await fetch(base, { headers })).json()).length, 1);
    const stale = await fetch(base + '/' + randomUUID(), { method: 'PUT', headers, body: '{not json' });
    assert.equal(stale.status, 400);
    assert.equal((await fetch(base.replace('gallery-reader', 'manga-reader'), { headers })).status, 404);
    assert.equal((await fetch(base + '/%E0%A4%A', { headers })).status, 400);
});
