import { Difficulty } from '@jsprismarine/minecraft';

/**
 * What the difficulty setting does to a blow.
 *
 * Only mob attacks are scaled. A player's sword does what the sword says whatever the world is set
 * to, and so does falling, drowning and burning - the setting is about how dangerous the monsters
 * are, not about how dangerous the world is.
 *
 * The multipliers are Mojang's documented `difficulty_modifier` for `minecraft:attack`; the
 * rounding is this server's, because the documentation states the multipliers and not what to do
 * with the halves they produce. Rounding gives vanilla's familiar figures for the mob everybody
 * checks against: a zombie's three becomes two on easy and five on hard.
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_attack
 */
const MULTIPLIERS: Readonly<Record<number, number>> = {
    [Difficulty.PEACEFUL]: 0,
    [Difficulty.EASY]: 0.5,
    [Difficulty.NORMAL]: 1,
    [Difficulty.HARD]: 1.5
};

/**
 * A mob's blow, scaled for how hard the world is set to.
 *
 * Peaceful is zero rather than "small": monsters do not hurt anybody on peaceful, and a mob that
 * still did a point of damage would make the setting a lie.
 * @param {number} damage - What the mob's attack attribute says.
 * @param {Difficulty} difficulty - What the world is set to.
 * @returns {number} What it is actually worth, in half-hearts.
 * @example
 * ```typescript
 * scaleForDifficulty(3, Difficulty.HARD); // => 5
 * ```
 */
export const scaleForDifficulty = (damage: number, difficulty: Difficulty): number => {
    // An unrecognised setting is treated as normal rather than as nothing: a mob that stopped
    // hurting anybody would be a far worse failure than one that hits at the usual rate.
    const multiplier = MULTIPLIERS[difficulty] ?? 1;

    return Math.round(damage * multiplier);
};

/** Whether monsters are allowed to exist at all, which is what peaceful really means. */
export const spawnsMonsters = (difficulty: Difficulty): boolean => difficulty !== Difficulty.PEACEFUL;

export { Difficulty };
