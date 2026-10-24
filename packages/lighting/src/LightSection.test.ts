import { describe, expect, it } from 'vitest';

import { LightSection, SECTION_SIZE, SECTION_VOLUME } from './LightSection';

describe('LightSection', () => {
    it('reads back a level written at local coordinates', () => {
        const section = new LightSection();

        section.set(3, 7, 11, 13);

        expect(section.get(3, 7, 11)).toBe(13);
    });

    it('starts every cell at zero', () => {
        const section = new LightSection();

        expect(section.get(0, 0, 0)).toBe(0);
        expect(section.get(15, 15, 15)).toBe(0);
    });

    it('keeps the two levels that share a byte independent', () => {
        const section = new LightSection();

        section.set(0, 0, 0, 15);
        section.set(0, 1, 0, 1);

        expect(section.get(0, 0, 0)).toBe(15);
        expect(section.get(0, 1, 0)).toBe(1);

        section.set(0, 0, 0, 2);

        expect(section.get(0, 0, 0)).toBe(2);
        expect(section.get(0, 1, 0)).toBe(1);
    });

    it('holds every cell of the section without aliasing', () => {
        const section = new LightSection();

        for (let x = 0; x < SECTION_SIZE; x++) {
            for (let y = 0; y < SECTION_SIZE; y++) {
                for (let z = 0; z < SECTION_SIZE; z++) {
                    section.set(x, y, z, (x + y + z) % 16);
                }
            }
        }

        for (let x = 0; x < SECTION_SIZE; x++) {
            for (let y = 0; y < SECTION_SIZE; y++) {
                for (let z = 0; z < SECTION_SIZE; z++) {
                    expect(section.get(x, y, z)).toBe((x + y + z) % 16);
                }
            }
        }
    });

    it('packs two levels per byte', () => {
        expect(SECTION_VOLUME).toBe(4096);
        expect(new LightSection().byteLength).toBe(SECTION_VOLUME / 2);
    });

    it('rejects a level outside 0 to 15', () => {
        const section = new LightSection();

        expect(() => section.set(0, 0, 0, 16)).toThrow(RangeError);
        expect(() => section.set(0, 0, 0, -1)).toThrow(RangeError);
    });

    it('rejects coordinates outside the section', () => {
        const section = new LightSection();

        expect(() => section.set(16, 0, 0, 1)).toThrow(RangeError);
        expect(() => section.get(0, -1, 0)).toThrow(RangeError);
    });
});
