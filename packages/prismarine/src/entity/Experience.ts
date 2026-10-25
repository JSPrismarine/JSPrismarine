/**
 * Experience, as a level and a fraction of the way to the next one.
 *
 * Bedrock carries the two separately - `minecraft:player.level` is a whole
 * number and `minecraft:player.experience` is the bar, from 0 to 1 - while
 * every rule that grants or spends experience counts *points*. So the two
 * forms have to be converted at every boundary, and the conversion is the
 * curve below.
 *
 * Java's curve, from `Player.getXpNeededForNextLevel`: a level costs
 * `2 * level + 7` points up to 15, `5 * level - 38` up to 30, and
 * `9 * level - 158` after that. The three segments are why the total is a
 * piecewise quadratic rather than one formula, and why the arithmetic here
 * walks levels instead of inverting a polynomial: the walk is exact, and the
 * highest level anything reaches in play is in the dozens.
 */

/** Points one more level costs, at the level the player is standing on. */
export const pointsForNextLevel = (level: number): number => {
    if (level >= 30) return 9 * level - 158;
    if (level >= 15) return 5 * level - 38;
    return 2 * level + 7;
};

/** A player's experience as the two numbers Bedrock sends. */
export interface ExperienceState {
    /** Whole levels. */
    readonly level: number;
    /** How far along the current level the bar is, from 0 to 1. */
    readonly progress: number;
}

/** The two attributes experience lives in. */
export interface ExperienceHolder {
    getLevel(): number;
    getProgress(): number;
    setLevel(level: number): void;
    setProgress(progress: number): void;
}

/**
 * Adds points to a holder, carrying over into levels.
 *
 * @param points - Experience points, which may be negative to take some away.
 * @returns The state after the change.
 */
export const addExperiencePoints = (holder: ExperienceHolder, points: number): ExperienceState => {
    let level = Math.max(0, Math.trunc(holder.getLevel()));
    let carried = holder.getProgress() * pointsForNextLevel(level) + points;

    while (carried < 0 && level > 0) {
        level -= 1;
        carried += pointsForNextLevel(level);
    }
    while (carried >= pointsForNextLevel(level)) {
        carried -= pointsForNextLevel(level);
        level += 1;
    }

    const state = { level, progress: Math.max(0, Math.min(1, carried / pointsForNextLevel(level))) };
    holder.setLevel(state.level);
    holder.setProgress(state.progress);
    return state;
};

/**
 * Spends whole levels, which is what an anvil and an enchanting table charge.
 *
 * The bar is cleared rather than kept, which is vanilla's behavior: enchanting
 * at a cost of three with a half-full bar leaves the bar empty.
 *
 * @returns Whether the holder could afford it. A holder that could not is left
 *   untouched.
 */
export const spendExperienceLevels = (holder: ExperienceHolder, levels: number): boolean => {
    const level = Math.trunc(holder.getLevel());
    if (levels <= 0 || level < levels) return false;

    holder.setLevel(level - levels);
    holder.setProgress(0);
    return true;
};
