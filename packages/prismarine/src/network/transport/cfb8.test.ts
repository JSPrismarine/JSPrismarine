import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { cfb8ViaEcb, createCfb8 } from './cfb8';

/** Feeds `data` through `update` in pieces of the given sizes, then the rest. */
const inPieces = (update: (data: Buffer) => Buffer, data: Buffer, sizes: readonly number[]): Buffer => {
    const out: Buffer[] = [];
    let at = 0;
    for (const size of sizes) {
        out.push(update(data.subarray(at, at + size)));
        at += size;
    }
    out.push(update(data.subarray(at)));
    return Buffer.concat(out);
};

describe('cfb8ViaEcb', () => {
    const key = randomBytes(16);
    const data = randomBytes(1000);
    // Node has CFB8 itself, so it says what the ECB construction must produce.
    const native = createCipheriv('aes-128-cfb8', key, key).update(data);

    it('encrypts as AES-128-CFB8 does, however the stream is split', () => {
        const cipher = cfb8ViaEcb('encrypt', key, key);

        expect(inPieces((piece) => cipher.update(piece), data, [1, 0, 15, 17, 300])).toStrictEqual(native);
    });

    it('decrypts what AES-128-CFB8 encrypted, however the stream is split', () => {
        const cipher = cfb8ViaEcb('decrypt', key, key);

        expect(inPieces((piece) => cipher.update(piece), native, [3, 16, 0, 200])).toStrictEqual(data);
        expect(createDecipheriv('aes-128-cfb8', key, key).update(native)).toStrictEqual(data);
    });
});

describe('createCfb8', () => {
    it('makes a pair that round-trips a stream', () => {
        const secret = randomBytes(16);
        const data = randomBytes(64);

        expect(
            createCfb8('decrypt', secret, secret).update(createCfb8('encrypt', secret, secret).update(data))
        ).toStrictEqual(data);
    });
});
