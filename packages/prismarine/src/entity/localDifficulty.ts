import type { Difficulty } from '@jsprismarine/engine-systems';
import { DIFFICULTIES } from '@jsprismarine/engine-systems';
import { MOON_BRIGHTNESS, moonPhase } from '@jsprismarine/spawning/engineRules';

/** The ticks of world time before Java's local difficulty starts to climb, three in-game days. */
const GLOBAL_DELAY_TICKS = 72_000;

/** The ticks over which the world-time part of Java's local difficulty climbs to its full quarter. */
const GLOBAL_RAMP_TICKS = 1_440_000;

/** The ticks a chunk must be lived in for its part of Java's local difficulty to reach its full share. */
const INHABITED_RAMP_TICKS = 3_600_000;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Java's effective local difficulty, `DifficultyInstance.getEffectiveDifficulty`: the difficulty's
 * id scaled from 0.75 up to 2 by the world's age, the time players spent in the chunk and the
 * moon. A fresh Normal world gives 1.5.
 *
 * @param difficulty - The world's difficulty, whose place in `DIFFICULTIES` is Java's id.
 * @param worldTicks - The world time, which Java reads as `getDayTime`.
 * @param inhabitedTicks - The ticks players have spent in the chunk.
 * @returns The effective difficulty, 0 on Peaceful.
 */
export const effectiveDifficulty = (difficulty: Difficulty, worldTicks: number, inhabitedTicks = 0): number => {
    if (difficulty === 'peaceful') return 0;
    const hard = difficulty === 'hard';
    const global = clamp01((worldTicks - GLOBAL_DELAY_TICKS) / GLOBAL_RAMP_TICKS) * 0.25;
    const moon = MOON_BRIGHTNESS[moonPhase(worldTicks)] ?? 0;
    let local = clamp01(inhabitedTicks / INHABITED_RAMP_TICKS) * (hard ? 1 : 0.75);
    local += Math.min(global, Math.max(0, moon * 0.25));
    if (difficulty === 'easy') local *= 0.5;
    return DIFFICULTIES.indexOf(difficulty) * (0.75 + global + local);
};

/**
 * Java's `DifficultyInstance.getSpecialMultiplier`: 0 below an effective difficulty of 2, 1 above
 * 4, and the straight line between.
 *
 * @param effective - The effective difficulty, from {@link effectiveDifficulty}.
 */
export const specialMultiplier = (effective: number): number =>
    effective < 2 ? 0 : effective > 4 ? 1 : (effective - 2) / 2;
