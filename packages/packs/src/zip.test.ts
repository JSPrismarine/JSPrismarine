import { describe, expect, it } from 'vitest';

import { textFiles, writeZip } from '../fixtures/writers';
import { createZipBudget, isZip, readZip, writeZip as writePackZip } from './zip';
import { PacksErrors, ZipError } from '@jsprismarine/errors/packs';

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

describe('writeZip', () => {
    const files = textFiles({ 'manifest.json': '{}', 'scripts/main.js': `// ${'a'.repeat(200)}` });

    it('stores every entry by default, so the same files give the same bytes', () => {
        const zip = writePackZip(files);
        const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

        expect(view.getUint16(8, true)).toBe(0);
        expect(writePackZip(textFiles({ 'manifest.json': '{}', 'scripts/main.js': `// ${'a'.repeat(200)}` }))).toEqual(
            zip
        );
        expect([...readZip(zip)].map(([name, data]) => [name, decoder.decode(data)])).toEqual([
            ['manifest.json', '{}'],
            ['scripts/main.js', `// ${'a'.repeat(200)}`]
        ]);
    });

    it('deflates the entries that shrink when asked', () => {
        const zip = writePackZip(files, { deflate: true });

        expect(zip.byteLength).toBeLessThan(writePackZip(files).byteLength);
        expect(decoder.decode(readZip(zip).get('scripts/main.js'))).toBe(`// ${'a'.repeat(200)}`);
    });

    it('refuses more entries than a zip without Zip64 holds', () => {
        const many = new Map(Array.from({ length: 0x10000 }, (_, i) => [`${i}.json`, new Uint8Array()]));

        expect(() => writePackZip(many)).toThrow(ZipError);
    });

    it('refuses files that fit 4 GiB until their headers are counted', () => {
        /** Claims a size it does not hold, so the test needs no 4 GiB of memory. */
        class Claimed extends Uint8Array {
            public override get length(): number {
                return 0x0fffffff;
            }
        }
        const sixteen = new Map(Array.from({ length: 16 }, (_, i) => [i.toString(16), new Claimed(0)]));

        expect(() => writePackZip(sixteen)).toThrow(PacksErrors.ZipTooLargeToWrite);
    });

    it('refuses a name longer than a zip records', () => {
        const name = 'a'.repeat(0x10000);

        expect(() => writePackZip(new Map([[name, new Uint8Array()]]))).toThrow(PacksErrors.ZipNameTooLong);
        expect(readZip(writePackZip(new Map([[name.slice(1), new Uint8Array()]]))).has(name.slice(1))).toBe(true);
    });
});
