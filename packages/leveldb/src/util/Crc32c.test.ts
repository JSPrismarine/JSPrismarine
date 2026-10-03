import { describe, expect, it } from 'vitest';

import { crc32c, crc32cUpdate, mask, unmask } from './Crc32c';

describe('leveldb', () => {
    describe('Crc32c', () => {
        // The vectors RFC 3720 appendix B.4 publishes for iSCSI, which uses the same polynomial.
        // Getting these right is what tells CRC-32C apart from zlib's CRC-32, and picking the
        // wrong one produces a database the game opens and then reports block by block as corrupt.
        it('matches the published vector for 32 zero bytes', () => {
            expect(crc32c(Buffer.alloc(32, 0x00))).toBe(0x8a9136aa);
        });

        it('matches the published vector for 32 0xff bytes', () => {
            expect(crc32c(Buffer.alloc(32, 0xff))).toBe(0x62a8ab43);
        });

        it('matches the published vector for 0x00..0x1f', () => {
            expect(crc32c(Buffer.from(Array.from({ length: 32 }, (_, i) => i)))).toBe(0x46dd794e);
        });

        it('matches the published vector for 0x1f..0x00', () => {
            expect(crc32c(Buffer.from(Array.from({ length: 32 }, (_, i) => 31 - i)))).toBe(0x113fdb5c);
        });

        it('is empty for an empty buffer', () => {
            expect(crc32c(Buffer.alloc(0))).toBe(0);
        });

        it('continues a running checksum across a split', () => {
            // A table block's checksum covers the block data and then the compression byte, which
            // arrive separately, so the running form has to agree with the one-shot form.
            const whole = Buffer.from('the quick brown fox jumps over the lazy dog');
            const split = crc32cUpdate(whole.subarray(20), crc32cUpdate(whole.subarray(0, 20)));

            expect(split).toBe(crc32c(whole));
        });

        describe('masking', () => {
            it('round-trips', () => {
                for (const value of [0, 1, 0x8a9136aa, 0xffffffff, 0x62a8ab43]) {
                    expect(unmask(mask(value))).toBe(value);
                }
            });

            it('stays inside 32 unsigned bits', () => {
                for (const value of [0, 0x7fffffff, 0x80000000, 0xffffffff]) {
                    const masked = mask(value);
                    expect(masked).toBeGreaterThanOrEqual(0);
                    expect(masked).toBeLessThanOrEqual(0xffffffff);
                }
            });

            it('does not leave a checksum equal to itself', () => {
                // The whole point of the mask: a CRC taken over a buffer that contains a CRC must
                // not be the value already sitting there.
                expect(mask(0x8a9136aa)).not.toBe(0x8a9136aa);
            });
        });
    });
});
