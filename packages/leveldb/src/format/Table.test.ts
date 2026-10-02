import { describe, expect, it } from 'vitest';

import { BlockBuilder } from './BlockBuilder';
import { BlockReader } from './BlockReader';
import { CompressionType } from '../compression/Compression';
import { compareBytewise } from '../util/Comparator';
import { CorruptionError } from '../Errors';
import { FOOTER_LENGTH, TABLE_MAGIC, decodeFooter, encodeFooter } from './Footer';
import { TableBuilder } from './TableBuilder';
import { TableReader, bufferSource } from './TableReader';

const key = (text: string) => Buffer.from(text);

/** Keys must reach a block or table in sorted order, so generate them that way. */
const sortedKeys = (count: number): Buffer[] =>
    Array.from({ length: count }, (_, i) => Buffer.from(`key:${String(i).padStart(8, '0')}`));

const buildTable = (entries: Array<[Buffer, Buffer]>, compression = CompressionType.ZlibRaw): Buffer => {
    const builder = new TableBuilder({ compression, blockSize: 512 });
    for (const [k, v] of entries) builder.add(k, v);
    return builder.finish();
};

const openTable = (bytes: Buffer) => new TableReader(bufferSource(bytes), compareBytewise);

describe('leveldb', () => {
    describe('Footer', () => {
        it('round-trips both handles', () => {
            const footer = { metaIndexHandle: { offset: 1234, size: 56 }, indexHandle: { offset: 7890, size: 12 } };

            expect(decodeFooter(encodeFooter(footer))).toEqual(footer);
        });

        it('is exactly 48 bytes, whatever the handles hold', () => {
            expect(
                encodeFooter({ metaIndexHandle: { offset: 0, size: 0 }, indexHandle: { offset: 0, size: 0 } })
            ).toHaveLength(FOOTER_LENGTH);
            expect(
                encodeFooter({
                    metaIndexHandle: { offset: 0xffffffff, size: 0xffffff },
                    indexHandle: { offset: 0xffffffff, size: 0xffffff }
                })
            ).toHaveLength(FOOTER_LENGTH);
        });

        it('ends with the magic the format defines', () => {
            const encoded = encodeFooter({
                metaIndexHandle: { offset: 1, size: 2 },
                indexHandle: { offset: 3, size: 4 }
            });

            expect(encoded.readBigUInt64LE(FOOTER_LENGTH - 8)).toBe(TABLE_MAGIC);
        });

        it('refuses a footer whose magic does not match', () => {
            const encoded = encodeFooter({
                metaIndexHandle: { offset: 1, size: 2 },
                indexHandle: { offset: 3, size: 4 }
            });
            encoded.writeUInt8(0, 0);
            encoded.writeBigUInt64LE(0n, FOOTER_LENGTH - 8);

            expect(() => decodeFooter(encoded)).toThrow(/magic/);
        });
    });

    describe('block', () => {
        const roundTrip = (entries: Array<[Buffer, Buffer]>, restartInterval = 16) => {
            const builder = new BlockBuilder(restartInterval);
            for (const [k, v] of entries) builder.add(k, v);
            return new BlockReader(builder.finish(), compareBytewise);
        };

        it('round-trips entries in order', () => {
            const entries: Array<[Buffer, Buffer]> = sortedKeys(50).map((k) => [k, Buffer.from(`value for ${k}`)]);
            const read = [...roundTrip(entries).entries()];

            expect(read.map((e) => e.key)).toEqual(entries.map(([k]) => k));
            expect(read.map((e) => e.value)).toEqual(entries.map(([, v]) => v));
        });

        it('round-trips an empty block', () => {
            expect([...roundTrip([]).entries()]).toHaveLength(0);
        });

        it('round-trips keys that share no prefix at all', () => {
            const entries: Array<[Buffer, Buffer]> = [
                [key('\x00'), key('a')],
                [key('mmm'), key('b')],
                [key('\xff\xff'), key('c')]
            ];

            expect([...roundTrip(entries).entries()].map((e) => e.value)).toEqual([key('a'), key('b'), key('c')]);
        });

        it('round-trips an empty value', () => {
            expect([...roundTrip([[key('k'), Buffer.alloc(0)]]).entries()][0]!.value.byteLength).toBe(0);
        });

        it('round-trips at every restart interval that changes the layout', () => {
            const entries: Array<[Buffer, Buffer]> = sortedKeys(40).map((k) => [k, Buffer.from('v')]);

            for (const interval of [1, 2, 3, 16, 39, 40, 41, 1000]) {
                expect([...roundTrip(entries, interval).entries()].map((e) => e.key)).toEqual(entries.map(([k]) => k));
            }
        });

        describe('seek', () => {
            const entries: Array<[Buffer, Buffer]> = sortedKeys(100).map((k) => [k, Buffer.from(k)]);
            const block = roundTrip(entries, 4);

            it('lands on an exact match', () => {
                expect(block.seek(key('key:00000042'))?.key).toEqual(key('key:00000042'));
            });

            it('lands on the next key when there is no exact match', () => {
                expect(block.seek(key('key:00000041x'))?.key).toEqual(key('key:00000042'));
            });

            it('lands on the first key when the target sorts before everything', () => {
                expect(block.seek(key('a'))?.key).toEqual(key('key:00000000'));
            });

            it('reports nothing when the target sorts after everything', () => {
                expect(block.seek(key('z'))).toBeNull();
            });

            it('finds every key it holds', () => {
                for (const [k] of entries) expect(block.seek(k)?.key).toEqual(k);
            });
        });

        it('refuses a block too short to hold a restart count', () => {
            expect(() => new BlockReader(Buffer.alloc(2), compareBytewise)).toThrow(CorruptionError);
        });

        it('refuses a block claiming more restart points than it holds', () => {
            const corrupt = Buffer.alloc(8);
            corrupt.writeUInt32LE(1000, 4);

            expect(() => new BlockReader(corrupt, compareBytewise)).toThrow(CorruptionError);
        });
    });

    describe('table', () => {
        it('round-trips ten thousand keys', () => {
            const entries: Array<[Buffer, Buffer]> = sortedKeys(10_000).map((k, i) => [k, Buffer.from(`v${i}`)]);
            const table = openTable(buildTable(entries));

            const read = [...table.entries()];
            expect(read).toHaveLength(10_000);
            expect(read.map((e) => e.key)).toEqual(entries.map(([k]) => k));

            // Point lookups have to agree with the scan, since they take a different path through
            // the index.
            for (const i of [0, 1, 4999, 9998, 9999]) {
                expect(table.get(entries[i]![0])).toEqual(entries[i]![1]);
            }
        });

        it('round-trips under every compression type it can write', () => {
            const entries: Array<[Buffer, Buffer]> = sortedKeys(500).map((k) => [k, Buffer.from('x'.repeat(64))]);

            for (const compression of [CompressionType.None, CompressionType.Zlib, CompressionType.ZlibRaw]) {
                const table = openTable(buildTable(entries, compression));
                expect([...table.entries()]).toHaveLength(500);
                expect(table.get(entries[250]![0])).toEqual(entries[250]![1]);
            }
        });

        it('round-trips a single entry', () => {
            const table = openTable(buildTable([[key('only'), key('one')]]));

            expect(table.get(key('only'))).toEqual(key('one'));
            expect([...table.entries()]).toHaveLength(1);
        });

        it('round-trips an empty table', () => {
            expect([...openTable(buildTable([])).entries()]).toHaveLength(0);
            expect(openTable(buildTable([])).get(key('anything'))).toBeNull();
        });

        it('round-trips values far larger than a block', () => {
            const entries: Array<[Buffer, Buffer]> = [
                [key('big:1'), Buffer.alloc(200_000, 0xab)],
                [key('big:2'), Buffer.alloc(150_000, 0xcd)]
            ];
            const table = openTable(buildTable(entries));

            expect(table.get(key('big:1'))).toEqual(entries[0]![1]);
            expect(table.get(key('big:2'))).toEqual(entries[1]![1]);
        });

        it('puts the footer at exactly the last 48 bytes', () => {
            const bytes = buildTable(sortedKeys(100).map((k) => [k, Buffer.from('v')]));

            expect(bytes.readBigUInt64LE(bytes.byteLength - 8)).toBe(TABLE_MAGIC);
            expect(() => decodeFooter(bytes.subarray(bytes.byteLength - FOOTER_LENGTH))).not.toThrow();
        });

        it('reports nothing for a key it does not hold', () => {
            const table = openTable(buildTable(sortedKeys(100).map((k) => [k, Buffer.from('v')])));

            expect(table.get(key('key:00000000x'))).toBeNull();
            expect(table.get(key('aaa'))).toBeNull();
            expect(table.get(key('zzz'))).toBeNull();
        });

        describe('seekFrom', () => {
            const entries: Array<[Buffer, Buffer]> = sortedKeys(1000).map((k) => [k, Buffer.from(k)]);
            const table = openTable(buildTable(entries));

            it('starts at an exact match and runs to the end', () => {
                const from = [...table.seekFrom(key('key:00000900'))];

                expect(from).toHaveLength(100);
                expect(from[0]!.key).toEqual(key('key:00000900'));
                expect(from.at(-1)!.key).toEqual(key('key:00000999'));
            });

            it('starts at the next key when there is no exact match', () => {
                expect([...table.seekFrom(key('key:00000499x'))][0]!.key).toEqual(key('key:00000500'));
            });

            it('yields everything when the target sorts before the table', () => {
                expect([...table.seekFrom(key('a'))]).toHaveLength(1000);
            });

            it('yields nothing when the target sorts after the table', () => {
                expect([...table.seekFrom(key('zzz'))]).toHaveLength(0);
            });

            it('crosses block boundaries without dropping or repeating an entry', () => {
                // blockSize is 512 here, so 1000 entries span many blocks and the handover between
                // them is the interesting part.
                const seen = [...table.seekFrom(key('key:00000000'))].map((e) => e.key.toString());

                expect(new Set(seen).size).toBe(1000);
                expect(seen).toEqual([...seen].sort());
            });
        });

        describe('corruption', () => {
            it('rejects a flipped bit in a data block', () => {
                const bytes = buildTable(sortedKeys(200).map((k) => [k, Buffer.from('v')]));
                bytes.writeUInt8(bytes.readUInt8(16) ^ 0x01, 16);

                expect(() => [...openTable(bytes).entries()]).toThrow(/checksum mismatch/);
            });

            it('rejects a table shorter than its footer', () => {
                expect(() => openTable(Buffer.alloc(10))).toThrow(CorruptionError);
            });

            it('rejects a file that is not a table at all', () => {
                expect(() => openTable(Buffer.alloc(100))).toThrow(/magic/);
            });
        });
    });
});
