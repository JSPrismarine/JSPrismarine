import { describe, expect, it } from 'vitest';

import { textFiles, writeZip } from '../fixtures/writers';
import { ZipError, isZip, readZip } from './zip';

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

    it('detects the local header signature', () => {
        expect(isZip(writeZip(textFiles({ 'a.json': '{}' })))).toBe(true);
        expect(isZip(new Uint8Array([1, 2, 3, 4]))).toBe(false);
    });
});
