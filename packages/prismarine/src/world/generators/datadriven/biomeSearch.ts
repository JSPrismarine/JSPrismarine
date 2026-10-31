/**
 * The biome walk behind `/locate biome`, which is Java's `BiomeSource.findClosestBiome3d`.
 *
 * Nothing here touches a chunk. The climate sampler answers a biome for any cell of the world,
 * so the search lays a grid over the bare noise and asks the sampler cell by cell, outward from
 * the origin, until a cell holds a biome the caller wants. Java reads the same sampler through
 * `createCachingResolver`, which is the noise biome before `BiomeManager` jitters it, so the
 * answer is a grid position rather than the nearest block of the biome; the caller walks the
 * last few blocks.
 *
 * The three constants the command passes are Java's `LocateCommand` ones: a radius of 6400
 * blocks, 32 blocks between columns and 64 between samples of a column.
 */
import type { BiomeResolver } from '@jsprismarine/worldgen';

/** What {@link findClosestBiome} is asked. */
export interface BiomeSearchOptions {
    /** Where to search from, in blocks. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    /** How far out to look, in blocks, as a square around the origin. */
    readonly radius: number;
    /** Blocks between two columns of the grid. */
    readonly horizontalStep: number;
    /** Blocks between two samples of a column. */
    readonly verticalStep: number;
    /** The dimension's floor, in blocks. */
    readonly minY: number;
    /** How many blocks the dimension spans above its floor. */
    readonly height: number;
    /** Every biome the dimension's source can produce; a biome outside it is never looked for. */
    readonly possibleBiomes: Iterable<string>;
    /** Whether a biome identifier is one the caller wants. */
    readonly wanted: (biome: string) => boolean;
    /** The noise biome of a cell, at quart resolution. */
    readonly noiseBiome: BiomeResolver;
}

/** A cell the search found. */
export interface BiomeSearchHit {
    /** The biome identifier, for example `minecraft:plains`. */
    readonly biome: string;
    /** The sampled position, in blocks: a column of the grid and a height of its walk. */
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The nearest grid cell holding a wanted biome, or undefined when the radius holds none.
 *
 * "Nearest" is by Java's walk rather than by distance: the columns are visited in one spiral
 * and each column from the origin's height outward, and the first cell met wins. Two cells at
 * one distance are told apart by that order, which is what makes the answer Java's answer.
 */
export const findClosestBiome = (options: BiomeSearchOptions): BiomeSearchHit | undefined => {
    const targets = new Set<string>();
    for (const biome of options.possibleBiomes) {
        if (options.wanted(biome)) targets.add(biome);
    }
    if (targets.size === 0) return undefined;

    const { origin, horizontalStep } = options;
    const steps = Math.floor(options.radius / horizontalStep);
    // Java's bounds are `getMinY() + 1` and `getMaxY() + 1`, the latter being the floor plus the
    // height, so the walk never samples the floor itself and may sample one above the ceiling.
    const heights = [...outFromOrigin(origin.y, options.minY + 1, options.minY + options.height, options.verticalStep)];

    for (const offset of spiralAround(steps)) {
        const x = origin.x + offset.x * horizontalStep;
        const z = origin.z + offset.z * horizontalStep;
        const quartX = x >> 2;
        const quartZ = z >> 2;

        for (const y of heights) {
            const biome = options.noiseBiome(quartX, y >> 2, quartZ);
            if (targets.has(biome)) return { biome, x, y, z };
        }
    }

    return undefined;
};

/**
 * Java's `Mth.outFromOrigin`: the origin, then one step above and one below in turn, each side
 * dropped once it leaves the bounds.
 *
 * @param origin - Where to start; clamped into the bounds first.
 * @param lower - The lowest value allowed, inclusive.
 * @param upper - The highest value allowed, inclusive.
 * @param step - How far apart the values are.
 */
function* outFromOrigin(origin: number, lower: number, upper: number, step: number): Generator<number> {
    const start = Math.min(Math.max(origin, lower), upper);
    let current = start;

    while (true) {
        const distance = Math.abs(start - current);
        if (start - distance < lower && start + distance > upper) return;
        yield current;

        // Java's step function: from a value at or below the start, go the same distance above
        // plus one step if that is still in bounds, otherwise one step further below; from a
        // value above the start, mirror it below, and when that falls out, keep going above.
        const atOrBelow = current <= start;
        const above = start + distance + step;
        if (atOrBelow && above <= upper) {
            current = above;
            continue;
        }

        const below = start - distance - (atOrBelow ? step : 0);
        current = below >= lower ? below : above;
    }
}

/**
 * Java's `BlockPos.spiralAround(ZERO, radius, EAST, SOUTH)`: the origin, then a square spiral
 * that leaves it eastward and turns south, with legs that grow by one every second turn.
 *
 * @param radius - How many legs out to walk, which is how many steps the farthest offset is.
 */
function* spiralAround(radius: number): Generator<{ readonly x: number; readonly z: number }> {
    // East, south, west, north: +x, +z, -x, -z.
    const directions = [
        { x: 1, z: 0 },
        { x: 0, z: 1 },
        { x: -1, z: 0 },
        { x: 0, z: -1 }
    ] as const;
    const legs = 4 * radius;

    // The cursor starts one step south of the origin so the first move, north, lands on it.
    let x = 0;
    let z = 1;
    let leg = -1;
    let legSize = 0;
    let legIndex = 0;

    while (true) {
        const direction = directions[(leg + 4) % 4]!;
        x += direction.x;
        z += direction.z;

        if (legIndex >= legSize) {
            if (leg >= legs) return;
            leg++;
            legIndex = 0;
            legSize = Math.floor(leg / 2) + 1;
        }

        legIndex++;
        yield { x, z };
    }
}
