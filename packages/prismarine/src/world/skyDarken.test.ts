import { describe, expect, it } from 'vitest';

import { overworldSkyDarken } from './skyDarken';

describe('overworldSkyDarken', () => {
    it("follows the day timeline's sky light, reaching the phantoms' 5 at day time 12687", () => {
        expect(overworldSkyDarken(6000, 'clear')).toBe(0);
        expect(overworldSkyDarken(18_000, 'clear')).toBe(11);
        expect(overworldSkyDarken(12_686, 'clear')).toBe(4);
        expect(overworldSkyDarken(12_687, 'clear')).toBe(5);
        // The morning ramp wraps over midnight to the first keyframe at 133.
        expect(overworldSkyDarken(24_000 + 133, 'clear')).toBe(0);
        expect(overworldSkyDarken(23_500, 'clear')).toBeGreaterThan(0);
    });

    it('darkens a rainy noon to 3 and a stormy one to 7, which phantoms come in', () => {
        expect(overworldSkyDarken(6000, 'rain')).toBe(3);
        expect(overworldSkyDarken(6000, 'thunder')).toBe(7);
    });
});
