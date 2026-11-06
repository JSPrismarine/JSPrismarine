import type { SpawnPosition, SpawnSiteFlag, SpawnWorld } from './world';
import { SPAWN_SITE_FLAGS } from './world';

/** The world as one spawn attempt sees it, with the means to start the next attempt clean. */
export interface AttemptWorld extends SpawnWorld {
    /** Reads that missed the cache and reached the underlying world, since the last {@link AttemptWorld.begin}. */
    readonly misses: number;
    /**
     * Forgets every cached fact and fixes the column the next attempt reads from.
     * @param at - The candidate position. Reads at another x or z go straight to the world.
     */
    begin(at: SpawnPosition): void;
}

/** Wide enough for the flags with room to spare, so `y * STRIDE + flag` never collides. */
const FLAG_STRIDE = 8;

/**
 * Wraps a world so the reads one candidate position makes are made once.
 *
 * Every rule and condition an attempt tries asks the same questions of the same column: is it
 * underwater, what is below it, how bright is it, what do its biome tags say, how many of a type
 * are nearby. A rule list of dozens repeats each of them. The answers cannot change while the
 * attempt evaluates, since nothing spawns until it returns, so {@link AttemptWorld.begin} drops
 * them at the start of the next one.
 *
 * Reads inside an attempt differ only in `y` (the cell itself, the one above, the ones below), so
 * the facts are keyed by `y` alone and a read at a different x or z is not cached. That keeps the
 * key a number and the lookup cheap enough to pay for itself when the world's own read is cheap.
 * Nothing here draws a random value or reorders a read the caller made, so spawn outcomes and the
 * random stream are unchanged.
 * @param world - The world to read through.
 * @returns A view with the same surface as the world.
 */
export const attemptWorldOf = (world: SpawnWorld): AttemptWorld => {
    const sites = new Map<number, boolean>();
    const blocks = new Map<number, string | undefined>();
    const solids = new Map<number, boolean>();
    const lights = new Map<number, number>();
    const biomeTags = new Map<number, readonly string[]>();
    const biomes = new Map<number, string>();
    const counts = new Map<string, number>();
    const borders = new Map<number, number | undefined>();
    let x = Number.NaN;
    let z = Number.NaN;
    let misses = 0;

    const inColumn = (at: SpawnPosition): boolean => at.x === x && at.z === z;

    const view: AttemptWorld = {
        get misses() {
            return misses;
        },
        begin: (at) => {
            x = at.x;
            z = at.z;
            misses = 0;
            sites.clear();
            blocks.clear();
            solids.clear();
            lights.clear();
            biomeTags.clear();
            biomes.clear();
            counts.clear();
            borders.clear();
        },
        site: (flag: SpawnSiteFlag, at) => {
            if (!inColumn(at)) return world.site(flag, at);
            const key = at.y * FLAG_STRIDE + SPAWN_SITE_FLAGS.indexOf(flag);
            let value = sites.get(key);
            if (value === undefined) {
                misses += 1;
                value = world.site(flag, at);
                sites.set(key, value);
            }
            return value;
        },
        block: (at) => {
            if (!inColumn(at)) return world.block(at);
            if (blocks.has(at.y)) return blocks.get(at.y);
            misses += 1;
            const value = world.block(at);
            blocks.set(at.y, value);
            return value;
        },
        solid: (at) => {
            if (!inColumn(at)) return world.solid(at);
            let value = solids.get(at.y);
            if (value === undefined) {
                misses += 1;
                value = world.solid(at);
                solids.set(at.y, value);
            }
            return value;
        },
        light: (at) => {
            if (!inColumn(at)) return world.light(at);
            let value = lights.get(at.y);
            if (value === undefined) {
                misses += 1;
                value = world.light(at);
                lights.set(at.y, value);
            }
            return value;
        },
        biomeTags: (at) => {
            if (!inColumn(at)) return world.biomeTags(at);
            let value = biomeTags.get(at.y);
            if (value === undefined) {
                misses += 1;
                value = world.biomeTags(at);
                biomeTags.set(at.y, value);
            }
            return value;
        },
        surfaceY: (surfaceX, surfaceZ) => world.surfaceY(surfaceX, surfaceZ),
        minY: () => world.minY(),
        players: () => world.players(),
        poolCount: (pool) => world.poolCount(pool),
        typeCount: (identifier, at, radius) => {
            if (!inColumn(at)) return world.typeCount(identifier, at, radius);
            const key = `${identifier}|${radius}|${at.y}`;
            let value = counts.get(key);
            if (value === undefined) {
                misses += 1;
                value = world.typeCount(identifier, at, radius);
                counts.set(key, value);
            }
            return value;
        },
        difficulty: () => world.difficulty(),
        weather: () => world.weather(),
        age: () => world.age(),
        mobEventActive: (event) => world.mobEventActive(event)
    };

    // Optional members stay optional: a condition asks `world.biome?.()` and treats absence as
    // "not answerable", which a stub that always answers would turn into a wrong answer.
    const biome = world.biome?.bind(world);
    if (biome !== undefined) {
        view.biome = (at) => {
            if (!inColumn(at)) return biome(at);
            let value = biomes.get(at.y);
            if (value === undefined) {
                misses += 1;
                value = biome(at);
                biomes.set(at.y, value);
            }
            return value;
        };
    }
    const worldSpawn = world.worldSpawn?.bind(world);
    if (worldSpawn !== undefined) view.worldSpawn = worldSpawn;
    const border = world.villageBorderDistance?.bind(world);
    if (border !== undefined) {
        view.villageBorderDistance = (at) => {
            if (!inColumn(at)) return border(at);
            if (borders.has(at.y)) return borders.get(at.y);
            misses += 1;
            const value = border(at);
            borders.set(at.y, value);
            return value;
        };
    }
    const override = world.structureSpawnOverrideAt?.bind(world);
    if (override !== undefined) view.structureSpawnOverrideAt = override;

    return view;
};
