import { describe, expect, it } from 'vitest';

import { plainText } from './markdownText.ts';

describe('plainText', () => {
    it('keeps link labels and drops code and bold marks', () => {
        expect(plainText('reads [named](./nbt) **tags** with `NBTReader`')).toBe('Reads named tags with NBTReader');
    });

    it('reads backslash escapes as the characters they escape, except inside code', () => {
        expect(plainText('A\\* path finder for \\[grid\\] worlds')).toBe('A* path finder for [grid] worlds');
        expect(plainText('matches `a\\*b` literally')).toBe('Matches a\\*b literally');
    });

    it('leaves the case of text that opens with code', () => {
        expect(plainText('`const` declarations')).toBe('const declarations');
    });
});
