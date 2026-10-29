import { describe, expect, it } from 'vitest';

import { decodeDataBundle, encodeDataBundle, isSafeBundlePath } from './dataBundle';

describe('dataBundle', () => {
    it('round-trips files byte for byte', () => {
        const files = new Map<string, Uint8Array>([
            ['.cache/jsprismarine/vanilla-datapack/26.3/pack.mcmeta', Buffer.from('{"pack":{}}')],
            ['@jsprismarine/blocks/vanilla_overlay/manifest.json', Buffer.from([0, 1, 2, 255])],
            ['empty/file', Buffer.alloc(0)]
        ]);

        const decoded = decodeDataBundle(encodeDataBundle(files));

        expect([...decoded.keys()]).toEqual([...files.keys()]);
        for (const [path, bytes] of files) expect(Buffer.from(decoded.get(path)!)).toEqual(Buffer.from(bytes));
    });

    it('refuses paths that could escape the extraction root', () => {
        for (const path of ['../up', '/absolute', 'a/../b', 'a\\b', 'C:/windows', '', 'a//b']) {
            expect(isSafeBundlePath(path), path).toBe(false);
        }
        expect(isSafeBundlePath('.cache/jsprismarine/java-structures/26.3/empty.nbt')).toBe(true);

        const bundle = encodeDataBundle(new Map([['../escape', Buffer.from('x')]]));
        expect(() => decodeDataBundle(bundle)).toThrow(/escapes the extraction root/);
    });

    it('rejects a truncated blob', () => {
        const bundle = encodeDataBundle(new Map([['a', Buffer.from('abc')]]));
        const truncated = Buffer.from(bundle);
        // Flip the index length so the declared entry outruns the bytes.
        expect(() => decodeDataBundle(truncated.subarray(0, 10))).toThrow();
    });
});
