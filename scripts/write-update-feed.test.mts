import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { parseUpdateFeed } from '../packages/prismarine/src/updates/feed.ts';
import { assetTargetOf, buildUpdateFeed, feedBytes, replaces, signFeed } from './write-update-feed.mts';

const files = [
    { name: 'prismarine-linux-x64', bytes: new Uint8Array([1, 2, 3]) },
    { name: 'prismarine-windows-x64.exe', bytes: new Uint8Array([4]) },
    { name: 'JSPrismarine-arm64.app.zip', bytes: new Uint8Array([5]) },
    { name: 'highlights.md', bytes: new Uint8Array([6]) }
];

const feedFor = (overrides: Partial<Parameters<typeof buildUpdateFeed>[0]> = {}) =>
    buildUpdateFeed({
        channel: 'release',
        version: '0.25.0',
        commit: 'abc',
        repository: 'JSPrismarine/JSPrismarine',
        published: '2026-11-25T00:00:00.000Z',
        files,
        ...overrides
    });

describe('assetTargetOf', () => {
    it('names each executable by its target and skips other files', () => {
        expect(files.map(({ name }) => assetTargetOf(name))).toEqual([
            'linux-x64',
            'windows-x64',
            'darwin-arm64-app',
            undefined
        ]);
    });
});

describe('buildUpdateFeed', () => {
    it('writes a feed the server reads, with every executable', () => {
        const feed = feedFor();

        expect(parseUpdateFeed(JSON.parse(feedBytes(feed).toString('utf8')))).toEqual(feed);
        expect(Object.keys(feed.assets).sort()).toEqual(['darwin-arm64-app', 'linux-x64', 'windows-x64']);
        expect(feed.assets['linux-x64']).toEqual({
            url: 'https://github.com/JSPrismarine/JSPrismarine/releases/download/jsprismarine%400.25.0/prismarine-linux-x64',
            sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
            size: 3
        });
    });

    it("points a JSPrismarine release at the site's notes and anything else at its GitHub release", () => {
        expect(feedFor().notes).toBe('https://jsprismarine.dev/releases#v0-25-0');
        const nightly = feedFor({ channel: 'nightly', version: '0.26.0-nightly.20261125.1' });
        expect(nightly.notes).toBe(nightly.url);
        const fork = feedFor({ repository: 'someone/fork' });
        expect(fork.notes).toBe('https://github.com/someone/fork/releases/tag/jsprismarine%400.25.0');
    });
});

describe('replaces', () => {
    it('moves the feed forward, or reruns the same version, but never back unless told to', () => {
        const older = feedFor({ version: '0.24.0' });
        const current = feedFor();

        expect(replaces(current, undefined)).toBe(true);
        expect(replaces(current, older)).toBe(true);
        expect(replaces(current, current)).toBe(true);
        expect(replaces(older, current)).toBe(false);
        expect(replaces(older, current, true)).toBe(true);
    });
});

describe('signFeed', () => {
    it('signs the exact bytes with Ed25519', () => {
        const { privateKey, publicKey } = generateKeyPairSync('ed25519');
        const bytes = feedBytes(feedFor());

        const signature = signFeed(bytes, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());

        expect(verify(null, bytes, publicKey, Buffer.from(signature, 'base64'))).toBe(true);
    });
});
