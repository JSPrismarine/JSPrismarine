import { describe, expect, it } from 'vitest';

import { CorruptionError } from '../Errors';
import { LOG_BLOCK_SIZE, LOG_HEADER_SIZE, LogWriter, readLogRecords } from './LogFormat';
import { ValueType, encodeInternalKey } from './InternalKey';
import { WriteBatch } from './WriteBatch';

const roundTrip = (records: Buffer[]): Buffer[] => {
    const writer = new LogWriter();
    for (const record of records) writer.append(record);
    return [...readLogRecords(writer.finish())];
};

describe('leveldb', () => {
    describe('log framing', () => {
        it('round-trips a single small record', () => {
            expect(roundTrip([Buffer.from('hello')])).toEqual([Buffer.from('hello')]);
        });

        it('round-trips many small records', () => {
            const records = Array.from({ length: 500 }, (_, i) => Buffer.from(`record ${i}`));

            expect(roundTrip(records)).toEqual(records);
        });

        it('round-trips an empty record', () => {
            // A zero-length record still needs one fragment written, or reading it back loses it.
            expect(roundTrip([Buffer.alloc(0)])).toEqual([Buffer.alloc(0)]);
        });

        it('round-trips a record that spans several blocks', () => {
            const record = Buffer.alloc(LOG_BLOCK_SIZE * 3 + 17, 0x5a);

            expect(roundTrip([record])).toEqual([record]);
        });

        it('round-trips a record that exactly fills a block', () => {
            const record = Buffer.alloc(LOG_BLOCK_SIZE - LOG_HEADER_SIZE, 0x11);

            expect(roundTrip([record])).toEqual([record]);
        });

        it('round-trips a record one byte too long for a block', () => {
            const record = Buffer.alloc(LOG_BLOCK_SIZE - LOG_HEADER_SIZE + 1, 0x22);

            expect(roundTrip([record])).toEqual([record]);
        });

        it('round-trips records that leave a block tail too short for a header', () => {
            // The tail gets zero-padded and the next record starts a fresh block. Land in each of
            // the six positions where fewer than seven bytes are left.
            for (const slack of [0, 1, 2, 3, 4, 5, 6]) {
                const first = Buffer.alloc(LOG_BLOCK_SIZE - LOG_HEADER_SIZE - slack, 0x33);
                const second = Buffer.from('after the padding');

                expect(roundTrip([first, second])).toEqual([first, second]);
            }
        });

        it('pads with zeroes rather than starting a header it cannot finish', () => {
            const writer = new LogWriter();
            writer.append(Buffer.alloc(LOG_BLOCK_SIZE - LOG_HEADER_SIZE - 3, 0x44));
            writer.append(Buffer.from('x'));
            const bytes = writer.finish();

            expect(bytes.subarray(LOG_BLOCK_SIZE - 3, LOG_BLOCK_SIZE)).toEqual(Buffer.alloc(3));
        });

        it('keeps blocks aligned when appending to a file that already has some', () => {
            // The writer is told how long the file already is; getting that wrong misaligns every
            // block boundary from there on and the next reader stops early.
            const existing = new LogWriter();
            existing.append(Buffer.from('first'));
            const head = existing.finish();

            const appended = new LogWriter(head.byteLength);
            const long = Buffer.alloc(LOG_BLOCK_SIZE, 0x55);
            appended.append(long);

            expect([...readLogRecords(Buffer.concat([head, appended.finish()]))]).toEqual([Buffer.from('first'), long]);
        });

        describe('recovery', () => {
            it('stops at a record truncated mid-payload rather than throwing', () => {
                // What a log looks like after a crash: the last write did not finish. Reading has
                // to yield everything before it and stop quietly.
                const writer = new LogWriter();
                writer.append(Buffer.from('complete'));
                writer.append(Buffer.alloc(200, 0x66));
                const bytes = writer.finish();

                expect([...readLogRecords(bytes.subarray(0, bytes.byteLength - 100))]).toEqual([
                    Buffer.from('complete')
                ]);
            });

            it('stops at a record truncated mid-header', () => {
                const writer = new LogWriter();
                writer.append(Buffer.from('complete'));
                writer.append(Buffer.from('lost'));
                const bytes = writer.finish();

                expect([...readLogRecords(bytes.subarray(0, bytes.byteLength - 8))]).toEqual([Buffer.from('complete')]);
            });

            it('stops when a multi-block record loses its tail', () => {
                const writer = new LogWriter();
                writer.append(Buffer.from('complete'));
                writer.append(Buffer.alloc(LOG_BLOCK_SIZE * 2, 0x77));
                const bytes = writer.finish();

                expect([...readLogRecords(bytes.subarray(0, LOG_BLOCK_SIZE + 100))]).toEqual([Buffer.from('complete')]);
            });

            it('throws on a bad checksum in the middle of the file', () => {
                // Unlike a short tail, this is real damage rather than an interrupted write.
                const writer = new LogWriter();
                writer.append(Buffer.from('first record'));
                writer.append(Buffer.from('second record'));
                const bytes = writer.finish();
                bytes.writeUInt8(bytes.readUInt8(LOG_HEADER_SIZE) ^ 0xff, LOG_HEADER_SIZE);

                expect(() => [...readLogRecords(bytes)]).toThrow(CorruptionError);
            });
        });
    });

    describe('WriteBatch', () => {
        it('round-trips puts and deletes together', () => {
            const batch = new WriteBatch().put(Buffer.from('a'), Buffer.from('1')).del(Buffer.from('b'));
            const { sequence, batch: decoded } = WriteBatch.decode(batch.encode(42n));

            expect(sequence).toBe(42n);
            expect(decoded.entries()).toEqual([
                { type: ValueType.Value, key: Buffer.from('a'), value: Buffer.from('1') },
                { type: ValueType.Deletion, key: Buffer.from('b') }
            ]);
        });

        it('round-trips a sequence past what a double holds', () => {
            const { sequence } = WriteBatch.decode(new WriteBatch().del(Buffer.from('k')).encode(0xfffffffffffffn));

            expect(sequence).toBe(0xfffffffffffffn);
        });

        it('round-trips an empty batch', () => {
            const { batch } = WriteBatch.decode(new WriteBatch().encode(1n));

            expect(batch.count).toBe(0);
        });

        it('round-trips empty keys and values', () => {
            const { batch } = WriteBatch.decode(new WriteBatch().put(Buffer.alloc(0), Buffer.alloc(0)).encode(1n));

            expect(batch.entries()[0]!.value!.byteLength).toBe(0);
        });

        it('round-trips binary keys, which is what chunk keys are', () => {
            const chunkKey = encodeInternalKey(
                Buffer.from([0xf6, 0xff, 0xff, 0xff, 0x00, 0x2f, 0xfc]),
                3n,
                ValueType.Value
            );
            const { batch } = WriteBatch.decode(new WriteBatch().put(chunkKey, Buffer.from([0x09, 0x01])).encode(1n));

            expect(batch.entries()[0]!.key).toEqual(chunkKey);
        });

        it('survives the log framing it is stored in', () => {
            const batch = new WriteBatch();
            for (let i = 0; i < 2000; i++) batch.put(Buffer.from(`key ${i}`), Buffer.alloc(64, i & 0xff));

            const writer = new LogWriter();
            writer.append(batch.encode(7n));

            const [record] = [...readLogRecords(writer.finish())];
            expect(WriteBatch.decode(record!).batch.count).toBe(2000);
        });

        it('refuses a batch shorter than its own header', () => {
            expect(() => WriteBatch.decode(Buffer.alloc(4))).toThrow(CorruptionError);
        });

        it('refuses an unknown operation type', () => {
            const encoded = new WriteBatch().put(Buffer.from('a'), Buffer.from('b')).encode(1n);
            encoded.writeUInt8(9, 12);

            expect(() => WriteBatch.decode(encoded)).toThrow(/type 9/);
        });
    });
});
