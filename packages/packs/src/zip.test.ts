import { describe, expect, it } from 'vitest';

import { textFiles, writeZip } from '../fixtures/writers';
import { ZipError, createZipBudget, isZip, readZip } from './zip';

const decoder = new TextDecoder();

describe('readZip', () => {
    it('round-trips stored and deflated entries', () => {
        const files = textFiles({
            'manifest.json': '{}',
            'entities/zombie.json': `{"repetitive": "${'a'.repeat(200)}"}`
        });
        const read = readZip(writeZip(files));

        expect([...read.keys()]).toEqual(['manifest.json', 'entities/zombie.json']);
        expect(decoder.decode(read.get('manifest.json'))).toBe('{}');
        expect(decoder.decode(read.get('entities/zombie.json'))).toContain('repetitive');
    });

    it('skips directory entries', () => {
        const read = readZip(writeZip(textFiles({ 'entities/': '', 'entities/a.json': '{}' })));
        expect([...read.keys()]).toEqual(['entities/a.json']);
    });

    it('rejects bytes with no end-of-central-directory record', () => {
        expect(() => readZip(new Uint8Array(64))).toThrow(ZipError);
    });

    /** The archive's central directory entry for the `index`th file. */
    const centralEntry = (zip: Uint8Array, index: number): number => {
        const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
        let cursor = view.getUint32(zip.byteLength - 22 + 16, true);
        for (let i = 0; i < index; i++) {
            cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true);
        }
        return cursor;
    };

    it('refuses an entry that expands past the entry limit, before inflating it', () => {
        const zip = writeZip(textFiles({ 'bomb.json': 'a'.repeat(10_000) }));

        expect(() => readZip(zip, { maxEntryBytes: 9_999 })).toThrow(/past the 9999 allowed/);
        expect(readZip(zip, { maxEntryBytes: 10_000 }).get('bomb.json')).toHaveLength(10_000);
    });

    it('refuses an entry that inflates past the size it declares', () => {
        const zip = writeZip(textFiles({ 'bomb.json': 'a'.repeat(10_000) }));
        // Declare 100 bytes for a stream that holds 10000.
        new DataView(zip.buffer).setUint32(centralEntry(zip, 0) + 24, 100, true);

        expect(() => readZip(zip)).toThrow(ZipError);
    });

    it('refuses a stored entry whose two sizes disagree', () => {
        // Too short to shrink, so the writer stores it rather than deflating it.
        const zip = writeZip(textFiles({ 'a.json': '{}' }));
        const entry = centralEntry(zip, 0);
        const view = new DataView(zip.buffer);
        expect(view.getUint16(entry + 10, true)).toBe(0);
        view.setUint32(entry + 24, 1, true);

        expect(() => readZip(zip)).toThrow(/stored a.json has two sizes/);
    });

    it('refuses two names over the same compressed record', () => {
        const zip = writeZip(textFiles({ 'a.json': 'a'.repeat(1_000), 'b.json': 'b'.repeat(1_000) }));
        const view = new DataView(zip.buffer);
        // Point the second entry at the first entry's record.
        view.setUint32(centralEntry(zip, 1) + 42, view.getUint32(centralEntry(zip, 0) + 42, true), true);

        expect(() => readZip(zip)).toThrow(/overlaps another entry/);
    });

    it('spends one budget across reads that share it, as nested archives do', () => {
        const zip = writeZip(textFiles({ 'a.json': 'a'.repeat(600) }));
        const budget = createZipBudget(1_000);

        readZip(zip, { budget });

        expect(budget.remaining).toBe(400);
        expect(() => readZip(zip, { budget })).toThrow(/archive budget/);
    });

    it('detects the local header signature', () => {
        expect(isZip(writeZip(textFiles({ 'a.json': '{}' })))).toBe(true);
        expect(isZip(new Uint8Array([1, 2, 3, 4]))).toBe(false);
    });
});
