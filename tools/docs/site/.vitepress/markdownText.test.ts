import { describe, expect, it } from 'vitest';

import { inlineText, plainText } from './markdownText.ts';

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

describe('inlineText', () => {
    it('reads Markdown as plainText does, and leaves the case of the first word', () => {
        expect(inlineText('itemOfSlotValue\\(\\) in [slotLog](./slotLog)')).toBe('itemOfSlotValue() in slotLog');
    });
});
