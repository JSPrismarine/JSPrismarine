import type { RandomSource } from '@jsprismarine/predicates';

import type { SpawnPosition, SpawnWorld } from './world';

/**
 * The spawn conditions Bedrock keeps in engine code rather than in
 * `spawn_rules/*.json`.
 *
 * The 24-component grammar cannot express a hash of the chunk coordinates or a
 * draw against the moon phase, so Mojang writes those in C++ and leaves the
 * JSON file as the coarse gate in front of them. `spawn_rules/slime.json` is
 * the clearest case: it carries no brightness filter, no height filter and a
 * weight of 100, which on its own lets a slime spawn in any `monster` biome in
 * daylight and fill the monster pool to its cap. The real rule is the function
 * at virtual address `0xbb80040` of BDS 1.26.51.1's `bedrock_server`, which
 * this module reimplements.
 *
 * A rule here runs after the JSON conditions pass and before the weighted
 * draw, so the file still decides the biomes, the difficulty and the weight,
 * and the code decides what the file cannot say.
 */

/** What an engine rule reads besides the position it is deciding. */
export interface EngineSpawnContext {
    readonly world: SpawnWorld;
    /** The spawner's own source, so one seed still reproduces one set of spawns. */
    readonly random: RandomSource;
}

/**
 * One entity's engine-side spawn condition.
 *
 * @returns Whether the entity may spawn at the position, with the entity's
 *   `spawn_rules/*.json` conditions already satisfied.
 */
export type EngineSpawnRule = (at: SpawnPosition, context: EngineSpawnContext) => boolean;

/** How far into the state a twist step reads its second word. */
const TWISTER_OFFSET = 397;

/** The multiplier of the twister's seeding recurrence, Matsumoto and Nishimura's 1812433253. */
const TWISTER_SEED_MULTIPLIER = 0x6c078965;

/** The twist step's tempering matrix. */
const TWISTER_MATRIX = 0x9908b0df;

/**
 * The first 32-bit draw of a Mersenne twister seeded with one value.
 *
 * Only the first draw exists because that is all the slime chunk rule takes.
 * The twist of word zero reads words zero, one and {@link TWISTER_OFFSET}, so
 * the seeding recurrence stops one word past the offset rather than filling
 * all 624 words of a full state. Bedrock's own copy stops in the same place.
 */
const firstTwisterDraw = (seed: number): number => {
    const state = new Uint32Array(TWISTER_OFFSET + 2);
    state[0] = seed;
    for (let index = 1; index < state.length; index += 1) {
        const previous = state[index - 1]!;
        state[index] = (Math.imul(TWISTER_SEED_MULTIPLIER, previous ^ (previous >>> 30)) + index) >>> 0;
    }

    const mixed = (state[0]! & 0x80000000) | (state[1]! & 0x7fffffff);
    let draw = state[TWISTER_OFFSET]! ^ (mixed >>> 1) ^ ((mixed & 1) === 0 ? 0 : TWISTER_MATRIX);

    draw ^= draw >>> 11;
    draw ^= (draw << 7) & 0x9d2c5680;
    draw ^= (draw << 15) & 0xefc60000;
    draw ^= draw >>> 18;
    return draw >>> 0;
};

/**
 * The multiplier Bedrock hashes a chunk's X coordinate by. It is the engine's
 * general-purpose hash multiplier rather than anything about slimes.
 */
const SLIME_CHUNK_MULTIPLIER = 0x1f1f1f1f;

/** One chunk in ten holds slimes, which is the divisor of the draw. */
const SLIME_CHUNK_IN = 10;

/** How many answers {@link isSlimeChunk} keeps before it starts over. */
const SLIME_CHUNK_MEMO_LIMIT = 4096;

const slimeChunkMemo = new Map<number, boolean>();

/**
 * Whether a chunk is a slime chunk.
 *
 * Bedrock seeds a Mersenne twister with `chunkX * 0x1f1f1f1f ^ chunkZ` and
 * takes its first draw modulo ten. The world seed is not part of it, which is
 * why a Bedrock slime farm sits at the same chunk coordinates in every world
 * and why Java's seeded formula is the wrong answer here.
 *
 * @param chunkX - The chunk's X coordinate, which is a block X shifted right by four.
 * @param chunkZ - The chunk's Z coordinate.
 */
export const isSlimeChunk = (chunkX: number, chunkZ: number): boolean => {
    const seed = (Math.imul(chunkX, SLIME_CHUNK_MULTIPLIER) ^ chunkZ) >>> 0;
    const known = slimeChunkMemo.get(seed);
    if (known !== undefined) return known;

    const answer = firstTwisterDraw(seed) % SLIME_CHUNK_IN === 0;
    if (slimeChunkMemo.size >= SLIME_CHUNK_MEMO_LIMIT) slimeChunkMemo.clear();
    slimeChunkMemo.set(seed, answer);
    return answer;
};

/** How many ticks one Minecraft day lasts. */
const DAY_TICKS = 24000;

/**
 * How bright the moon is at each of its eight phases, starting at the full
 * moon. The swamp branch of the slime rule draws against this number, so a
 * swamp spawns no slimes at all on a new moon.
 */
export const MOON_BRIGHTNESS: readonly number[] = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75];

/**
 * The moon phase at one world time.
 *
 * @param time - The world's age in ticks, which is never negative on a running server.
 * @returns A phase from 0, the full moon, to 7.
 */
export const moonPhase = (time: number): number => Math.abs(Math.trunc(time / DAY_TICKS)) % MOON_BRIGHTNESS.length;

/** The highest Y at which the slime chunk branch applies. */
const SLIME_CHUNK_CEILING = 38;

/** The lowest Y of the swamp branch's band. */
const SLIME_SWAMP_FLOOR = 50;

/** The highest Y of the swamp branch's band. */
const SLIME_SWAMP_CEILING = 68;

/**
 * The light a swamp slime tolerates, before the extra draw.
 *
 * It is an early exit rather than a second condition: the draw it guards is
 * over `[0, 8)`, so a light above seven already fails it.
 */
const SLIME_SWAMP_LIGHT_CEILING = 7;

/** The width of the draw the swamp branch compares the light against. */
const SLIME_SWAMP_LIGHT_DRAW = 8;

/**
 * The biome tag the swamp branch reads. Three vanilla biomes carry it:
 * `swampland`, `swampland_mutated` and `mangrove_swamp`.
 */
export const SLIME_SURFACE_BIOME_TAG = 'spawns_slimes_on_surface';

/**
 * Where a slime may spawn, which `spawn_rules/slime.json` does not say.
 *
 * Two branches, as Bedrock writes them. At Y 38 and below the position has to
 * be in a slime chunk and nothing else is asked, which is why a slime farm is
 * dug out rather than lit up. Above that the position has to be in a swamp
 * between Y 50 and Y 68, dark enough, and lucky against the moon phase.
 * Everything in between, and every lit surface, spawns no slimes at all.
 *
 * The one divergence from the Bedrock function is the position the biome tag
 * is read at. Bedrock reads it one block higher than the spawn position; this
 * reads it at the spawn position, because a biome boundary is the only place
 * the two can differ and neither answer is more correct there.
 */
export const slimeSpawnRule: EngineSpawnRule = (at, { world, random }) => {
    if (at.y <= SLIME_CHUNK_CEILING) return isSlimeChunk(at.x >> 4, at.z >> 4);

    if (at.y < SLIME_SWAMP_FLOOR || at.y > SLIME_SWAMP_CEILING) return false;

    const light = world.light(at);
    if (light > SLIME_SWAMP_LIGHT_CEILING) return false;
    if (light > random.nextInt(SLIME_SWAMP_LIGHT_DRAW)) return false;

    if (random.nextFloat() >= MOON_BRIGHTNESS[moonPhase(world.age())]!) return false;

    return world.biomeTags(at).includes(SLIME_SURFACE_BIOME_TAG);
};

/**
 * Every engine rule vanilla needs, keyed by the entity it gates.
 *
 * {@link import('./spawner').Spawner} applies these by default. A host that
 * wants a different set passes its own map, and a host that wants none passes
 * an empty one.
 */
export const VANILLA_ENGINE_SPAWN_RULES: ReadonlyMap<string, EngineSpawnRule> = new Map([
    ['minecraft:slime', slimeSpawnRule]
]);
