import { Difficulty } from '@jsprismarine/minecraft';

/**
 * A blow to a player, scaled for how hard the world is set to, as Java's `Player.hurtServer`
 * scales a blow whose damage type scales with the difficulty: nothing on Peaceful, half and one
 * more on Easy but never more than the blow, the blow on Normal, and half again on Hard. Java
 * works in floats and does not round, so a zombie's 3 is 2.5 on Easy and 4.5 on Hard.
 * @param {number} damage - The blow before anything else takes its part.
 * @param {Difficulty} difficulty - What the world is set to.
 * @returns {number} What it is worth, in half-hearts.
 * @example
 * ```typescript
 * scaleForDifficulty(3, Difficulty.HARD); // => 4.5
 * ```
 */
export const scaleForDifficulty = (damage: number, difficulty: Difficulty): number => {
    switch (difficulty) {
        case Difficulty.PEACEFUL:
            return 0;
        case Difficulty.EASY:
            return Math.min(damage / 2 + 1, damage);
        case Difficulty.HARD:
            return (damage * 3) / 2;
        default:
            return damage;
    }
};

/** Whether monsters are allowed to exist at all, which is what peaceful really means. */
export const spawnsMonsters = (difficulty: Difficulty): boolean => difficulty !== Difficulty.PEACEFUL;

export { Difficulty };
