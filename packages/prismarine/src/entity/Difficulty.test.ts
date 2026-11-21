import { describe, expect, it } from 'vitest';

import { Difficulty, scaleForDifficulty } from './Difficulty';

describe('scaleForDifficulty', () => {
    it("scales a zombie's blow as Java's Player.hurtServer does, without rounding", () => {
        expect(scaleForDifficulty(3, Difficulty.PEACEFUL)).toBe(0);
        expect(scaleForDifficulty(3, Difficulty.EASY)).toBe(2.5);
        expect(scaleForDifficulty(3, Difficulty.NORMAL)).toBe(3);
        expect(scaleForDifficulty(3, Difficulty.HARD)).toBe(4.5);
    });

    it('never makes a blow bigger on Easy', () => {
        expect(scaleForDifficulty(1, Difficulty.EASY)).toBe(1);
        expect(scaleForDifficulty(2, Difficulty.EASY)).toBe(2);
    });
});
