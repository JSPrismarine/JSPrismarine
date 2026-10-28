/**
 * A map-backed world for the engine systems' tests and examples.
 *
 * The world is unbounded in x and z and bounded in y by `minY` and `maxY`.
 */

import type { BlockEntityData, BlockPosition, BlockRef, BlockStateValue, WorldAccess } from './world';
import { AIR, positionKey } from './world';
import type { ExplosionWorld } from './explosions';

/** How to build a {@link TestWorld}. */
export interface TestWorldOptions {
    minY?: number;
    maxY?: number;
    /** The random source, defaulting to one that always returns 0. */
    randomInt?: (bound: number) => number;
    /** The float source, defaulting to one that always returns 0. */
    randomFloat?: () => number;
}

/** A map-backed world with helpers for arranging blocks. */
export interface TestWorld extends WorldAccess, ExplosionWorld {
    /** Write a block without running neighbor updates. */
    place(at: BlockPosition, to: BlockRef): void;
    /** Write the same block over a run of positions along one axis. */
    placeLine(from: BlockPosition, axis: 'x' | 'y' | 'z', length: number, to: BlockRef): void;
    /** The block identifier at one position. */
    nameAt(at: BlockPosition): string;
    /** One state value at one position. */
    stateAt(at: BlockPosition, state: string): BlockStateValue | undefined;
    /** Write block entity data for a test. */
    setBlockEntityData(at: BlockPosition, data: BlockEntityData): void;
}

/**
 * Build a map-backed world.
 *
 * @param options - The height bounds and random sources.
 * @returns A world that satisfies {@link WorldAccess} and {@link ExplosionWorld}.
 * @example
 * ```typescript
 * const world = createTestWorld();
 * world.place({ x: 0, y: 0, z: 0 }, block('minecraft:stone'));
 * ```
 */
export const createTestWorld = (options: TestWorldOptions = {}): TestWorld => {
    const blocks = new Map<string, BlockRef>();
    const blockEntities = new Map<string, BlockEntityData>();
    const randomInt = options.randomInt ?? (() => 0);
    const randomFloat = options.randomFloat ?? (() => 0);
    const minY = options.minY ?? -64;
    const maxY = options.maxY ?? 319;

    const getBlock = (at: BlockPosition): BlockRef => {
        if (at.y < minY || at.y > maxY) return AIR;
        return blocks.get(positionKey(at)) ?? AIR;
    };

    const place = (at: BlockPosition, to: BlockRef): void => {
        if (to.name === AIR.name) blocks.delete(positionKey(at));
        else blocks.set(positionKey(at), to);
    };

    return {
        place,
        placeLine(from, axis, length, to) {
            for (let index = 0; index < length; index += 1) {
                place({ ...from, [axis]: from[axis] + index }, to);
            }
        },
        nameAt: (at) => getBlock(at).name,
        stateAt: (at, state) => getBlock(at).states[state],
        getBlock,
        setBlock(at, to, _notifyNeighbors) {
            place(at, to);
            if (to.name === AIR.name) blockEntities.delete(positionKey(at));
        },
        getBlockEntityData: (at) => blockEntities.get(positionKey(at)),
        setBlockEntityData(at, data) {
            blockEntities.set(positionKey(at), data);
        },
        randomInt,
        randomFloat,
        getMinY: () => minY,
        getMaxY: () => maxY
    };
};
