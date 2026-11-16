/**
 * Java's regional difficulty, which scales how often a fresh mob spawns armored.
 *
 * `ServerLevel.getCurrentDifficultyAt` builds a `DifficultyInstance` from the world's difficulty,
 * its day time, the chunk's inhabited time and the moon's brightness, and
 * `Mob.populateDefaultEquipmentSlots` gives armor only with a nonzero
 * `DifficultyInstance.getSpecialMultiplier`. Bedrock's equipment tables gate the same gear on
 * `random_regional_difficulty_chance`, whose `max_chance` the loot package scales by
 * {@link LootDifficultyView.scale}. A mob in a fresh world on normal difficulty sits at 1.5,
 * below the 2 the multiplier needs, so it spawns with no armor in either edition.
 */
import type { Difficulty } from '@jsprismarine/engine-systems';
import { DEFAULT_DIFFICULTY } from '@jsprismarine/loot/dialect';
import type { BedrockDifficulty, LootDifficultyView } from '@jsprismarine/loot/dialect';

/** What Java's `DifficultyInstance` is built from. */
export interface RegionalDifficultyInputs {
    readonly difficulty: Difficulty;
    /** Ticks of world time, which `Level.getDayTime` counts without wrapping at a day. */
    readonly worldTime: number;
    /** Ticks players have spent in the chunk, `LevelChunk.getInhabitedTime`. */
    readonly inhabitedTime: number;
    /** `Level.getMoonBrightness`: 1 at a full moon, 0 at a new moon. */
    readonly moonBrightness: number;
}

/** `DimensionType.MOON_BRIGHTNESS_PER_PHASE`, indexed by moon phase. */
const MOON_BRIGHTNESS_PER_PHASE = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75] as const;

/** Ticks in a Minecraft day. */
const TICKS_PER_DAY = 24_000;

/** The moon's brightness at a world time, through the eight phases one a day. */
export const moonBrightnessAt = (worldTime: number): number =>
    MOON_BRIGHTNESS_PER_PHASE[Math.floor(Math.max(0, worldTime) / TICKS_PER_DAY) % MOON_BRIGHTNESS_PER_PHASE.length] ??
    0;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Java's numeric difficulty ids, which scale the regional difficulty. */
const DIFFICULTY_IDS: Readonly<Record<Difficulty, number>> = { peaceful: 0, easy: 1, normal: 2, hard: 3 };

/**
 * `DifficultyInstance.calculateDifficulty`: the effective difficulty of one place, from 0 on
 * peaceful up to 6.75 in a long-inhabited chunk of an old world on hard.
 */
export const regionalDifficulty = (inputs: RegionalDifficultyInputs): number => {
    const { difficulty } = inputs;
    if (difficulty === 'peaceful') return 0;
    const global = clamp((inputs.worldTime - 72_000) / 1_440_000, 0, 1) * 0.25;
    let local = clamp(inputs.inhabitedTime / 3_600_000, 0, 1) * (difficulty === 'hard' ? 1 : 0.75);
    local += clamp(inputs.moonBrightness * 0.25, 0, global);
    if (difficulty === 'easy') local *= 0.5;
    return DIFFICULTY_IDS[difficulty] * (0.75 + global + local);
};

/**
 * `DifficultyInstance.getSpecialMultiplier`, the clamped regional difficulty: 0 below an effective
 * difficulty of 2, 1 above 4, and linear between.
 */
export const clampedRegionalDifficulty = (effective: number): number =>
    effective < 2 ? 0 : effective > 4 ? 1 : (effective - 2) / 2;

/**
 * The chance a mob that picks up by chance may pick up at all: `Zombie.finalizeSpawn` and
 * `AbstractSkeleton.finalizeSpawn` set `Mob.canPickUpLoot` to
 * `random.nextFloat() < 0.55F * difficulty.getSpecialMultiplier()`, so none does in a fresh region.
 */
export const canPickUpLootChance = (inputs: RegionalDifficultyInputs): number =>
    0.55 * clampedRegionalDifficulty(regionalDifficulty(inputs));

/**
 * The difficulty view Bedrock's equipment tables read, answering for one place while a roll for
 * it runs and as {@link DEFAULT_DIFFICULTY} otherwise.
 *
 * The loot package asks the view on every evaluation, so a roll sees the region set around it.
 */
export class RegionalDifficultyView implements LootDifficultyView {
    private region: { readonly level: BedrockDifficulty; readonly scale: number } | undefined;

    /** The world difficulty of the place a roll runs for, or normal outside a roll. */
    public level(): BedrockDifficulty {
        return this.region?.level ?? DEFAULT_DIFFICULTY.level();
    }

    /** The place's clamped regional difficulty, Java's special multiplier, or 1 outside a roll. */
    public scale(): number {
        return this.region?.scale ?? DEFAULT_DIFFICULTY.scale();
    }

    /**
     * Runs `roll` with the view answering for one place.
     * @param inputs - The place's difficulty, world time, inhabited time and moon.
     * @param roll - The roll to run, which reads the view.
     * @returns What `roll` returns.
     */
    public during<Result>(inputs: RegionalDifficultyInputs, roll: () => Result): Result {
        const previous = this.region;
        this.region = { level: inputs.difficulty, scale: clampedRegionalDifficulty(regionalDifficulty(inputs)) };
        try {
            return roll();
        } finally {
            this.region = previous;
        }
    }
}
