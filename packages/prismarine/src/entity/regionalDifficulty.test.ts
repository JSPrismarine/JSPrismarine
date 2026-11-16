import { describe, expect, it } from 'vitest';

import {
    RegionalDifficultyView,
    clampedRegionalDifficulty,
    moonBrightnessAt,
    regionalDifficulty
} from './regionalDifficulty';

const DAY = 24_000;

describe("Java's regional difficulty", () => {
    it('is 1.5 in a fresh chunk of a new world on normal, which gives no special multiplier', () => {
        const effective = regionalDifficulty({
            difficulty: 'normal',
            worldTime: 0,
            inhabitedTime: 0,
            moonBrightness: 1
        });
        expect(effective).toBe(1.5);
        expect(clampedRegionalDifficulty(effective)).toBe(0);
    });

    it('is zero on peaceful however long players have lived in the chunk', () => {
        expect(
            regionalDifficulty({
                difficulty: 'peaceful',
                worldTime: 100 * DAY,
                inhabitedTime: 10_000_000,
                moonBrightness: 1
            })
        ).toBe(0);
    });

    it('reaches 6.75 on hard in an old, long-inhabited chunk under a full moon', () => {
        const effective = regionalDifficulty({
            difficulty: 'hard',
            worldTime: 100 * DAY,
            inhabitedTime: 3_600_000,
            moonBrightness: 1
        });
        expect(effective).toBe(6.75);
        expect(clampedRegionalDifficulty(effective)).toBe(1);
    });

    it('halves the local term on easy', () => {
        // 0.75 + 0.25 global, plus half of 0.75 inhabited and 0.25 moon.
        expect(
            regionalDifficulty({
                difficulty: 'easy',
                worldTime: 100 * DAY,
                inhabitedTime: 3_600_000,
                moonBrightness: 1
            })
        ).toBe(1.5);
    });

    it('scales the multiplier linearly between an effective difficulty of 2 and 4', () => {
        expect(clampedRegionalDifficulty(2)).toBe(0);
        expect(clampedRegionalDifficulty(3)).toBe(0.5);
        expect(clampedRegionalDifficulty(4)).toBe(1);
    });

    it('reads the moon through its eight phases, one a day', () => {
        expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((day) => moonBrightnessAt(day * DAY))).toEqual([
            1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75, 1
        ]);
    });
});

describe('the regional difficulty view', () => {
    it('answers for the place a roll runs in, and as a ramped normal region otherwise', () => {
        const view = new RegionalDifficultyView();
        const inside = view.during(
            { difficulty: 'hard', worldTime: 100 * DAY, inhabitedTime: 3_600_000, moonBrightness: 1 },
            () => ({ level: view.level(), scale: view.scale() })
        );
        expect(inside).toEqual({ level: 'hard', scale: 1 });
        expect({ level: view.level(), scale: view.scale() }).toEqual({ level: 'normal', scale: 1 });
    });
});
