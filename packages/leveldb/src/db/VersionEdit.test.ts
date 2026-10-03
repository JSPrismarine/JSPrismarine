import { describe, expect, it } from 'vitest';

import { BYTEWISE_COMPARATOR } from '../util/Comparator';
import { ByteWriter } from '../util/ByteWriter';
import { CorruptionError } from '../Errors';
import { decodeVersionEdit, encodeVersionEdit } from './VersionEdit';
import { ValueType, encodeInternalKey } from '../format/InternalKey';
import { VersionSet } from './VersionSet';
import type { FileMetaData, VersionEdit } from './VersionEdit';

const internal = (text: string, sequence = 1n) => encodeInternalKey(Buffer.from(text), sequence, ValueType.Value);

const file = (number: number, smallest: string, largest: string, size = 1024): FileMetaData => ({
    number,
    size,
    smallest: internal(smallest),
    largest: internal(largest)
});

describe('leveldb', () => {
    describe('VersionEdit', () => {
        it('round-trips every field', () => {
            const edit: VersionEdit = {
                comparator: BYTEWISE_COMPARATOR,
                logNumber: 12,
                previousLogNumber: 11,
                nextFileNumber: 30,
                lastSequence: 987654321n,
                deletedFiles: [
                    [0, 5],
                    [1, 6]
                ],
                newFiles: [
                    [0, file(7, 'aaa', 'mmm')],
                    [1, file(8, 'nnn', 'zzz')]
                ]
            };

            expect(decodeVersionEdit(encodeVersionEdit(edit))).toEqual(edit);
        });

        it('round-trips an empty edit', () => {
            expect(decodeVersionEdit(encodeVersionEdit({}))).toEqual({});
        });

        it('round-trips a sequence past what a double holds', () => {
            const decoded = decodeVersionEdit(encodeVersionEdit({ lastSequence: 0xfffffffffffffn }));

            expect(decoded.lastSequence).toBe(0xfffffffffffffn);
        });

        it('round-trips binary keys, which is what chunk keys are', () => {
            const smallest = encodeInternalKey(Buffer.from([0xf6, 0xff, 0x00, 0x2f]), 3n, ValueType.Value);
            const decoded = decodeVersionEdit(
                encodeVersionEdit({ newFiles: [[2, { number: 1, size: 9, smallest, largest: smallest }]] })
            );

            expect(decoded.newFiles![0]![1].smallest).toEqual(smallest);
        });

        it('reads past a compact pointer without losing its place', () => {
            // A tag we do not keep, but one the game writes. Reading it by the wrong number of
            // bytes turns every later record in the manifest into garbage.
            const encoded = Buffer.concat([
                new ByteWriter().varint32(5).varint32(1).lengthPrefixed(internal('somewhere')).finish(),
                encodeVersionEdit({ lastSequence: 42n, logNumber: 3 })
            ]);

            expect(decodeVersionEdit(encoded)).toEqual({ lastSequence: 42n, logNumber: 3 });
        });

        it('refuses a tag it does not know', () => {
            expect(() => decodeVersionEdit(new ByteWriter().varint32(99).finish())).toThrow(CorruptionError);
        });
    });

    describe('VersionSet', () => {
        it('adds and removes files', () => {
            const versions = new VersionSet();
            versions.applyEdit({ newFiles: [[0, file(5, 'a', 'z')]] });
            expect(versions.totalFiles).toBe(1);

            versions.applyEdit({ deletedFiles: [[0, 5]] });
            expect(versions.totalFiles).toBe(0);
        });

        it('keeps level 0 newest first', () => {
            // Level 0 files overlap, so they must be searched in the order they were written.
            const versions = new VersionSet();
            versions.applyEdit({
                newFiles: [
                    [0, file(5, 'a', 'z')],
                    [0, file(9, 'a', 'z')],
                    [0, file(7, 'a', 'z')]
                ]
            });

            expect(versions.files(0).map((f) => f.number)).toEqual([9, 7, 5]);
        });

        it('keeps lower levels sorted by their smallest key', () => {
            const versions = new VersionSet();
            versions.applyEdit({
                newFiles: [
                    [1, file(5, 'mmm', 'ppp')],
                    [1, file(9, 'aaa', 'ccc')]
                ]
            });

            expect(versions.files(1).map((f) => f.number)).toEqual([9, 5]);
        });

        it('never lets the next file number go backwards', () => {
            const versions = new VersionSet();
            versions.applyEdit({ nextFileNumber: 10, newFiles: [[0, file(42, 'a', 'z')]] });

            // A file numbered above what the manifest claimed must still push the counter past it,
            // or the next allocation would collide with a live file.
            expect(versions.allocateFileNumber()).toBe(43);
        });

        it('keeps the highest sequence it has seen', () => {
            const versions = new VersionSet();
            versions.applyEdit({ lastSequence: 100n });
            versions.applyEdit({ lastSequence: 50n });

            expect(versions.lastSequence).toBe(100n);
        });

        it('accepts a sorted run and rejects an overlapping one', () => {
            const sorted = new VersionSet();
            sorted.applyEdit({
                newFiles: [
                    [1, file(1, 'aaa', 'ccc')],
                    [1, file(2, 'ddd', 'fff')]
                ]
            });
            expect(() => sorted.assertSortedRuns()).not.toThrow();

            const overlapping = new VersionSet();
            overlapping.applyEdit({
                newFiles: [
                    [1, file(1, 'aaa', 'eee')],
                    [1, file(2, 'ddd', 'fff')]
                ]
            });
            expect(() => overlapping.assertSortedRuns()).toThrow(/overlap/);
        });

        describe('candidates', () => {
            const versions = new VersionSet();
            versions.applyEdit({
                newFiles: [
                    [0, file(1, 'aaa', 'zzz')],
                    [0, file(2, 'mmm', 'nnn')],
                    [1, file(3, 'aaa', 'ccc')],
                    [1, file(4, 'ddd', 'fff')],
                    [2, file(5, 'aaa', 'zzz')]
                ]
            });

            it('offers every level 0 file whose range covers the key, newest first', () => {
                expect([...versions.candidates(Buffer.from('mmm'))].map((c) => c.file.number)).toEqual([2, 1, 5]);
            });

            it('offers at most one file per level below zero', () => {
                expect([...versions.candidates(Buffer.from('eee'))].map((c) => c.file.number)).toEqual([1, 4, 5]);
            });

            it('offers nothing for a key outside every range', () => {
                expect([...versions.candidates(Buffer.from('zzzzz'))]).toHaveLength(0);
            });
        });

        it('finds the files a range touches', () => {
            const versions = new VersionSet();
            versions.applyEdit({
                newFiles: [
                    [1, file(1, 'aaa', 'ccc')],
                    [1, file(2, 'ddd', 'fff')],
                    [1, file(3, 'ggg', 'iii')]
                ]
            });

            expect(versions.overlapping(1, internal('bbb'), internal('eee')).map((f) => f.number)).toEqual([1, 2]);
            expect(versions.overlapping(1, internal('jjj'), internal('kkk'))).toHaveLength(0);
        });

        it('snapshots itself into one edit that reproduces the same state', () => {
            const original = new VersionSet();
            original.applyEdit({
                logNumber: 4,
                lastSequence: 77n,
                newFiles: [
                    [0, file(1, 'aaa', 'ccc')],
                    [1, file(2, 'ddd', 'fff')]
                ]
            });

            const restored = new VersionSet();
            restored.applyEdit(decodeVersionEdit(encodeVersionEdit(original.snapshot(BYTEWISE_COMPARATOR))));

            expect(restored.lastSequence).toBe(77n);
            expect(restored.logNumber).toBe(4);
            expect(restored.files(0).map((f) => f.number)).toEqual([1]);
            expect(restored.files(1).map((f) => f.number)).toEqual([2]);
        });

        it('refuses a level the format does not have', () => {
            expect(() => new VersionSet().applyEdit({ newFiles: [[9, file(1, 'a', 'z')]] })).toThrow(CorruptionError);
        });
    });
});
