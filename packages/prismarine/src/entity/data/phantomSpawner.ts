/**
 * Java's `PhantomSpawner`: phantoms come for a player who has not slept, and for nobody else.
 *
 * Java runs it from the overworld's custom spawners, beside natural spawning, and no biome lists
 * the phantom, so it is the only way one spawns. Every one to two minutes, while the sky is dark
 * enough, it looks at each player who is not a spectator and stands at or above sea level under
 * open sky: a player whose regional difficulty beats a draw from 0 to 3, and whose
 * `Stats.TIME_SINCE_REST` beats a draw below it by 72000 ticks or more, gets a group of phantoms
 * 20 to 34 blocks overhead, one plus a draw up to the difficulty's id.
 */
import type { RandomSource } from '@jsprismarine/predicates';

import type { ContentEntity, ContentPosition } from '../../content/world/adapter';

/** The ticks a player has to go without rest before phantoms may come, three days. */
export const INSOMNIA_TICKS = 72_000;

/** The darkness `PhantomSpawner.tick` waits for: `getSkyDarken() < 5` stops it. */
const MIN_SKY_DARKEN = 5;

/** The largest value a Java statistic holds, which `Mth.clamp` bounds the rest stat to. */
const MAX_STAT_VALUE = 2_147_483_647;

/** What the spawner reads of the world, and the one thing it does to it. */
export interface PhantomSpawnWorld {
    readonly random: RandomSource;
    /** Whether `spawnPhantoms` is on and the world spawns monsters at all. */
    spawnsPhantoms(): boolean;
    /** Whether the dimension has a sky, `DimensionType.hasSkyLight`. */
    hasSkyLight(): boolean;
    /** `ServerLevel.getSeaLevel`. */
    seaLevel(): number;
    /** `Level.getSkyDarken`. */
    skyDarken(): number;
    /** The players in the world. */
    players(): readonly ContentEntity[];
    /** `Level.canSeeSky`: whether the sky light reaches the block at full strength. */
    canSeeSky(at: ContentPosition): boolean;
    /** `DifficultyInstance.getEffectiveDifficulty` where a player stands. */
    regionalDifficulty(at: ContentPosition): number;
    /** `Difficulty.getId`: 0 on peaceful to 3 on hard. */
    difficultyId(): number;
    /** `NaturalSpawner.isValidEmptySpawnBlock` for a phantom. */
    isValidEmptySpawnBlock(at: ContentPosition): boolean;
    /** Spawns one phantom standing at a block, as `Phantom.snapTo(pos)` and `finalizeSpawn` place it. */
    spawnPhantom(at: ContentPosition): void;
}

/** One world's phantom spawner, which keeps Java's countdown between its looks. */
export class PhantomSpawner {
    private nextTick = 0;

    /** One tick of `PhantomSpawner.tick`. */
    public tick(world: PhantomSpawnWorld): void {
        if (!world.spawnsPhantoms()) return;
        const { random } = world;
        this.nextTick -= 1;
        if (this.nextTick > 0) return;
        this.nextTick += (60 + random.nextInt(60)) * 20;
        const hasSkyLight = world.hasSkyLight();
        if (world.skyDarken() < MIN_SKY_DARKEN && hasSkyLight) return;

        for (const player of world.players()) {
            if (player.spectator === true) continue;
            const at = {
                x: Math.floor(player.position.x),
                y: Math.floor(player.position.y),
                z: Math.floor(player.position.z)
            };
            if (hasSkyLight && (at.y < world.seaLevel() || !world.canSeeSky(at))) continue;
            if (!(world.regionalDifficulty(at) > random.nextFloat() * 3)) continue;
            const rest = Math.min(MAX_STAT_VALUE, Math.max(1, player.timeSinceRest ?? 0));
            if (random.nextInt(rest) < INSOMNIA_TICKS) continue;

            // Java draws `above`, then `east`, then `south`.
            const up = 20 + random.nextInt(15);
            const east = -10 + random.nextInt(21);
            const south = -10 + random.nextInt(21);
            const spawnAt = { x: at.x + east, y: at.y + up, z: at.z + south };
            if (!world.isValidEmptySpawnBlock(spawnAt)) continue;
            const count = 1 + random.nextInt(world.difficultyId() + 1);
            for (let index = 0; index < count; index += 1) world.spawnPhantom(spawnAt);
        }
    }
}
