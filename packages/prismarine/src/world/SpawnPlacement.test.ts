import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import { SPAWN_RELOCATION_RANGE, UNKNOWN_SPAWN_HEIGHT, placePlayerSpawn } from './SpawnPlacement';

import type { SpawnTerrain } from './SpawnPlacement';

/** Columns keyed by `x,z`, each listing its blocks from the bottom up as `[y, name]`. */
type Columns = Record<string, Array<[number, string]>>;

const SOLID = new Set(['minecraft:grass_block', 'minecraft:dirt', 'minecraft:stone']);

/** A world that is air everywhere except the columns given. */
const terrainOf = (columns: Columns): SpawnTerrain => {
    const blockAt = (x: number, y: number, z: number): string =>
        columns[`${x},${z}`]?.find(([at]) => at === y)?.[1] ?? 'minecraft:air';

    return {
        minY: -64,
        maxY: 320,
        isObstructed: async (x, y, z) => SOLID.has(blockAt(x, y, z)),
        getBlockName: async (x, y, z) => blockAt(x, y, z),
        getHighestBlock: async (x, z) => {
            const column = columns[`${x},${z}`];
            return column === undefined || column.length === 0 ? null : Math.max(...column.map(([y]) => y));
        }
    };
};

/** Ground from y=55 up: stone, then dirt, then grass on top at 62. */
const ground = (): Array<[number, string]> => [
    ...Array.from({ length: 3 }, (_, i): [number, string] => [55 + i, 'minecraft:stone']),
    ...Array.from({ length: 4 }, (_, i): [number, string] => [58 + i, 'minecraft:dirt']),
    [62, 'minecraft:grass_block']
];

/**
 * The two columns of the world the measurements were taken in: open grass at (5, -6), and a
 * birch canopy at (4, -7) with air between it and the grass.
 */
const WORLD = terrainOf({
    '5,-6': ground(),
    '4,-7': [
        ...ground(),
        [65, 'minecraft:birch_leaves'],
        [66, 'minecraft:birch_leaves'],
        [67, 'minecraft:birch_leaves']
    ],
    '15,-8': [...ground().slice(0, -1), [62, 'minecraft:water']]
});

/** Offsets that are easy to tell apart in an assertion: x gets +3, z gets -2. */
const fixedOffsets = () => {
    const offsets = [3, -2];
    return () => offsets.shift() ?? 0;
};

const place = (x: number, y: number, z: number) => placePlayerSpawn(new Vector3(x, y, z), WORLD, fixedOffsets());

describe('placing a player at the world spawn', () => {
    it('puts the feet one block above the stored height, centered', async () => {
        // BDS: SpawnY 63 on grass whose top is at 62 put the feet at 64.
        const spawn = await place(5, 63, -6);

        expect(spawn.requested).toEqual(new Vector3(5.5, 64, -5.5));
        expect(spawn.position).toEqual(new Vector3(5.5, 64, -5.5));
        expect(spawn.relocated).toBe(false);
    });

    it('keeps a spot in mid-air, which the player then falls from', async () => {
        // BDS: SpawnY 70 over the same grass kept the feet at 71.
        expect((await place(5, 70, -6)).position).toEqual(new Vector3(5.5, 71, -5.5));
    });

    it('lifts a spot inside the ground to the first free space', async () => {
        // BDS: SpawnY 55, inside stone, came out with the feet at 63.
        expect((await place(5, 55, -6)).position).toEqual(new Vector3(5.5, 63, -5.5));
    });

    it('starts the unknown height on the surface', async () => {
        const spawn = await place(5, UNKNOWN_SPAWN_HEIGHT, -6);

        // The requested spot is still the literal one, as BDS reports it before resolving.
        expect(spawn.requested).toEqual(new Vector3(5.5, UNKNOWN_SPAWN_HEIGHT + 1, -5.5));
        expect(spawn.position).toEqual(new Vector3(5.5, 63, -5.5));
    });

    it('accepts water underneath', async () => {
        // BDS: SpawnY 63 over water at 62 kept the feet at 64.
        expect((await place(15, 63, -8)).position).toEqual(new Vector3(15.5, 64, -7.5));
    });

    it('moves a spot above leaves to a random nearby column, one block higher', async () => {
        // BDS: SpawnY 68 above the canopy, five times, always with the feet at 70.
        const spawn = await place(4, 68, -7);

        expect(spawn.relocated).toBe(true);
        expect(spawn.requested).toEqual(new Vector3(4.5, 69, -6.5));
        expect(spawn.position).toEqual(new Vector3(7.5, 70, -8.5));
    });

    it('does not check the column it moves to', async () => {
        // BDS put relocated players over water and inside hills. Here the offsets land on the
        // water column at (15, -8), and the height is still the one carried over.
        let calls = 0;
        const toWater = () => (calls++ === 0 ? 11 : -1);

        const spawn = await placePlayerSpawn(new Vector3(4, 68, -7), WORLD, toWater);

        expect(spawn.position).toEqual(new Vector3(15.5, 70, -7.5));
    });

    it('moves the unknown height above leaves from the canopy top', async () => {
        // BDS: SpawnY 32767 over the canopy came out one block above it, at 69.
        expect((await place(4, UNKNOWN_SPAWN_HEIGHT, -7)).position).toEqual(new Vector3(7.5, 69, -8.5));
    });

    it('keeps a spot under the canopy, because what matters is the landing block', async () => {
        // BDS: SpawnY 58 in the leafy column stayed put, on the grass under the tree.
        const spawn = await place(4, 58, -7);

        expect(spawn.relocated).toBe(false);
        expect(spawn.position).toEqual(new Vector3(4.5, 63, -6.5));
    });

    it('relocates within the measured range by default', async () => {
        for (let attempt = 0; attempt < 200; attempt++) {
            const { position } = await placePlayerSpawn(new Vector3(4, 68, -7), WORLD);

            expect(Math.abs(position.getX() - 4.5)).toBeLessThanOrEqual(SPAWN_RELOCATION_RANGE);
            expect(Math.abs(position.getZ() + 6.5)).toBeLessThanOrEqual(SPAWN_RELOCATION_RANGE);
            expect(Number.isInteger(position.getX() - 0.5)).toBe(true);
        }
    });
});
