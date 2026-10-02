import { describe, expect, it } from 'vitest';

import {
    MAX_SEQUENCE,
    ValueType,
    compareInternalKeys,
    encodeInternalKey,
    extractUserKey,
    lookupKey,
    parseInternalKey
} from './InternalKey';

const key = (text: string) => Buffer.from(text);

describe('leveldb', () => {
    describe('InternalKey', () => {
        it('round-trips a key, sequence and type', () => {
            const encoded = encodeInternalKey(key('chunk'), 12345n, ValueType.Value);
            const parsed = parseInternalKey(encoded);

            expect(parsed.userKey).toEqual(key('chunk'));
            expect(parsed.sequence).toBe(12345n);
            expect(parsed.type).toBe(ValueType.Value);
        });

        it('round-trips a deletion', () => {
            const parsed = parseInternalKey(encodeInternalKey(key('gone'), 1n, ValueType.Deletion));

            expect(parsed.type).toBe(ValueType.Deletion);
        });

        it('round-trips the largest sequence the 56 bit field holds', () => {
            const parsed = parseInternalKey(encodeInternalKey(key('k'), MAX_SEQUENCE, ValueType.Value));

            expect(parsed.sequence).toBe(MAX_SEQUENCE);
        });

        it('appends exactly eight bytes', () => {
            expect(encodeInternalKey(key('abc'), 1n, ValueType.Value).byteLength).toBe(11);
        });

        it('recovers the user key without validating the trailer', () => {
            expect(extractUserKey(encodeInternalKey(key('abc'), 9n, ValueType.Value))).toEqual(key('abc'));
        });

        describe('ordering', () => {
            it('sorts user keys ascending', () => {
                const a = encodeInternalKey(key('aaa'), 1n, ValueType.Value);
                const b = encodeInternalKey(key('bbb'), 1n, ValueType.Value);

                expect(compareInternalKeys(a, b)).toBeLessThan(0);
            });

            it('sorts a shorter user key before the longer one it prefixes', () => {
                const short = encodeInternalKey(key('ab'), 1n, ValueType.Value);
                const long = encodeInternalKey(key('abc'), 1n, ValueType.Value);

                expect(compareInternalKeys(short, long)).toBeLessThan(0);
            });

            it('sorts a newer sequence FIRST for one user key', () => {
                // Descending trailers is the whole point: a lookup seeks to the newest possible
                // version of a key and takes the first entry it lands on. Ascending order here
                // makes every read return the oldest value instead - stale terrain, no error.
                const older = encodeInternalKey(key('same'), 5n, ValueType.Value);
                const newer = encodeInternalKey(key('same'), 6n, ValueType.Value);

                expect(compareInternalKeys(newer, older)).toBeLessThan(0);
            });

            it('sorts a value before a deletion at the same sequence', () => {
                // The type is the trailer's low byte, so a larger type sorts first - which puts
                // Value (1) ahead of Deletion (0) and matches upstream.
                const deletion = encodeInternalKey(key('k'), 7n, ValueType.Deletion);
                const value = encodeInternalKey(key('k'), 7n, ValueType.Value);

                expect(compareInternalKeys(value, deletion)).toBeLessThan(0);
            });

            it('reports equality for identical keys', () => {
                const a = encodeInternalKey(key('k'), 3n, ValueType.Value);
                const b = encodeInternalKey(key('k'), 3n, ValueType.Value);

                expect(compareInternalKeys(a, b)).toBe(0);
            });

            it('orders a whole set the way a table expects', () => {
                const keys = [
                    encodeInternalKey(key('b'), 1n, ValueType.Value),
                    encodeInternalKey(key('a'), 1n, ValueType.Value),
                    encodeInternalKey(key('a'), 9n, ValueType.Value),
                    encodeInternalKey(key('a'), 5n, ValueType.Deletion)
                ];

                const sorted = [...keys].sort(compareInternalKeys).map((k) => {
                    const parsed = parseInternalKey(k);
                    return `${parsed.userKey.toString()}@${parsed.sequence}`;
                });

                expect(sorted).toEqual(['a@9', 'a@5', 'a@1', 'b@1']);
            });
        });

        describe('lookup', () => {
            it('seeks past every version of a key at or below the snapshot', () => {
                const target = lookupKey(key('k'), 10n);

                expect(compareInternalKeys(target, encodeInternalKey(key('k'), 10n, ValueType.Value))).toBe(0);
                expect(compareInternalKeys(target, encodeInternalKey(key('k'), 9n, ValueType.Value))).toBeLessThan(0);
                expect(compareInternalKeys(target, encodeInternalKey(key('k'), 11n, ValueType.Value))).toBeGreaterThan(
                    0
                );
            });
        });

        describe('malformed keys', () => {
            it('refuses a key with no room for a trailer', () => {
                expect(() => parseInternalKey(Buffer.alloc(7))).toThrow(RangeError);
            });

            it('refuses an unknown value type', () => {
                const encoded = encodeInternalKey(key('k'), 1n, ValueType.Value);
                encoded.writeUInt8(9, encoded.byteLength - 8);

                expect(() => parseInternalKey(encoded)).toThrow(/value type/);
            });
        });
    });
});
