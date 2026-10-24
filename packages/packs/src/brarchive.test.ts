import { describe, expect, it } from 'vitest';

import { textFiles, writeBrarchive } from '../fixtures/writers';
import { BrarchiveError, isBrarchive, readBrarchive } from './brarchive';

const decoder = new TextDecoder();

describe('readBrarchive', () => {
    it('round-trips files in table order', () => {
        const files = textFiles({ 'zombie.json': '{"a":1}', 'creeper.json': '{"b":2}' });
        const read = readBrarchive(writeBrarchive(files));

        expect([...read.keys()]).toEqual(['zombie.json', 'creeper.json']);
        expect(decoder.decode(read.get('zombie.json'))).toBe('{"a":1}');
        expect(decoder.decode(read.get('creeper.json'))).toBe('{"b":2}');
    });

    it('reads an empty archive', () => {
        expect(readBrarchive(writeBrarchive(new Map())).size).toBe(0);
    });

    it('rejects a bad magic number', () => {
        expect(() => readBrarchive(new Uint8Array(32))).toThrow(BrarchiveError);
    });

    it('rejects an unknown version', () => {
        const bytes = writeBrarchive(new Map());
        new DataView(bytes.buffer).setUint32(12, 2, true);
        expect(() => readBrarchive(bytes)).toThrow(/version 2/);
    });

    it('rejects an archive whose sizes do not add up', () => {
        const bytes = writeBrarchive(textFiles({ 'a.json': '{}' }));
        expect(() => readBrarchive(bytes.subarray(0, bytes.length - 1))).toThrow(BrarchiveError);
    });

    it('detects the magic number', () => {
        expect(isBrarchive(writeBrarchive(new Map()))).toBe(true);
        expect(isBrarchive(new Uint8Array([1, 2, 3]))).toBe(false);
    });
});
