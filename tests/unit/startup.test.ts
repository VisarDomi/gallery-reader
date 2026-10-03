import { expect, it } from 'vitest';
import { provider as hitomi } from '../../src/provider/hitomi/provider';
import { Handler } from '../../src/provider/types';

it('opens the requested page from native Hitomi hashes and plain hashes', () => {
    expect(hitomi.matchRoute('/reader/123.html', '', '#6-')).toEqual({ handler: Handler.Reader, gid: 123, index: 5 });
    expect(hitomi.matchRoute('/reader/123.html', '', '#5')).toEqual({ handler: Handler.Reader, gid: 123, index: 5 });
    expect(hitomi.matchRoute('/reader/123.html', '', '#invalid')).toEqual({ handler: Handler.Reader, gid: 123, index: 0 });
});
