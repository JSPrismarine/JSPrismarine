import { describe, expect, it } from 'vitest';

import { deathExperience, experienceOrbs } from './deathExperience';
import type { ExperienceFacts, ExperienceRule } from './deathExperience';

/** Facts for one death, drawing `draws` in turn. */
const facts = (overrides: Partial<ExperienceFacts> = {}, draws: readonly number[] = [0]): ExperienceFacts => {
    let index = 0;
    return {
        baby: false,
        equippedItems: 0,
        size: 1,
        random: { next: () => draws[index++ % draws.length] ?? 0 },
        ...overrides
    };
};

describe('deathExperience', () => {
    const animal: ExperienceRule = { kind: 'animal' };

    it('pays an adult animal one to three, and a baby nothing', () => {
        expect(deathExperience(animal, facts({}, [0]))).toBe(1);
        expect(deathExperience(animal, facts({}, [0.99]))).toBe(3);
        expect(deathExperience(animal, facts({ baby: true }, [0.99]))).toBe(0);
    });

    it('adds one to three for each item a monster holds or wears', () => {
        const monster: ExperienceRule = { kind: 'mob', xp: 5 };
        expect(deathExperience(monster, facts())).toBe(5);
        expect(deathExperience(monster, facts({ equippedItems: 2 }, [0, 0.99]))).toBe(5 + 1 + 3);
    });

    it('multiplies a baby zombie’s reward by two and a half before its gear', () => {
        const zombie: ExperienceRule = { kind: 'zombie', xp: 5 };
        expect(deathExperience(zombie, facts({ baby: true }))).toBe(12);
        expect(deathExperience(zombie, facts({ baby: true, equippedItems: 1 }, [0]))).toBe(13);
    });

    it('pays a slime its size, and a piglin its fixed reward whatever it holds', () => {
        expect(deathExperience({ kind: 'size' }, facts({ size: 4 }))).toBe(4);
        expect(deathExperience({ kind: 'fixed', xp: 5 }, facts({ equippedItems: 1 }))).toBe(5);
    });
});

describe('experienceOrbs', () => {
    it('splits an award into the largest orbs that fit, as Java does', () => {
        expect(experienceOrbs(5)).toEqual([3, 1, 1]);
        expect(experienceOrbs(50)).toEqual([37, 7, 3, 3]);
        expect(experienceOrbs(0)).toEqual([]);
    });
});
