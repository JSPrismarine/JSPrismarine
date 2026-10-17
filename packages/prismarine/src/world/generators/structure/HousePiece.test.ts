import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import Chunk from '../../chunk/Chunk';
import ChunkRandom from '../decoration/ChunkRandom';
import type { TerrainSampler } from './Structure';
import { StructureCanvas } from './Structure';
import { Facing } from './StructureBlocks';
import { HousePiece, villageMaterials } from './VillagePieces';

/**
 * One house, built in isolation.
 *
 * The village tests check that villages appear and hold together across chunk borders; this checks
 * that the building itself is a building. Drawn on its own, at coordinates the test chose, so the
 * geometry can be asserted directly instead of hunted for in whatever the world generator happened
 * to produce.
 */

/** Flat ground at 64, so a house placed on it needs no foundation and no levelling. */
const GROUND = 64;

const flatTerrain: TerrainSampler = {
    heightAt: () => GROUND,
    seaLevel: 62,
    floor: -64,
    ceiling: 319
};

/** A house drawn into a single chunk, well clear of its edges. */
const buildHouse = ({ width, depth, facing }: { width: number; depth: number; facing: Facing }) => {
    const chunk = new Chunk(0, 0);
    const stone = BlockRuntimeIds.getByName('minecraft:stone');
    const grass = BlockRuntimeIds.getByName('minecraft:grass_block');

    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, -64, GROUND - 1, stone);
            chunk.fillColumn(x, z, GROUND, GROUND, grass);
        }
    }

    const canvas = new StructureCanvas(chunk);
    const corner = { x: 3, z: 3 };
    const house = new HousePiece(corner, width, depth, GROUND, facing, villageMaterials(), new ChunkRandom(1, 0, 0));

    house.draw({ canvas, terrain: flatTerrain });

    const nameAt = (x: number, y: number, z: number) => chunk.getBlock(x, y, z).name;

    return { chunk, house, corner, nameAt };
};

const isAir = (name: string) => name === 'minecraft:air';

/**
 * The heights the roof occupies.
 *
 * Found by looking for the stairs rather than computed, because the wall height is chosen at random
 * per house - and a test that recomputed it would be asserting against its own copy of the code
 * rather than against the building.
 */
const roofLevels = (
    nameAt: (x: number, y: number, z: number) => string,
    box: { minX: number; maxX: number; minZ: number; maxZ: number }
): number[] => {
    const levels: number[] = [];

    for (let y = GROUND + 1; y <= GROUND + 16; y++) {
        let hasStairs = false;
        for (let x = box.minX; x <= box.maxX && !hasStairs; x++) {
            for (let z = box.minZ; z <= box.maxZ && !hasStairs; z++) {
                if (nameAt(x, y, z) === 'minecraft:oak_stairs') hasStairs = true;
            }
        }

        if (hasStairs) levels.push(y);
    }

    return levels;
};

describe('a village house', () => {
    it('closes the gable ends of its roof', () => {
        // A gabled roof is two sloping planes and nothing at the ends. Drawing only the slopes
        // leaves a triangular hole at each end of the ridge: the attic is open to the weather and
        // from the side the building has no top to it.
        //
        // The house is 9 wide by 5 deep, so the ridge runs along x and the gable ends are the two
        // extreme x columns of the roof.
        const width = 9;
        const depth = 5;
        const { nameAt, corner } = buildHouse({ width, depth, facing: Facing.North });

        const eaveMinX = corner.x - 1;
        const eaveMaxX = corner.x + width;
        const eaveMinZ = corner.z - 1;
        const eaveMaxZ = corner.z + depth;

        const levels = roofLevels(nameAt, { minX: eaveMinX, maxX: eaveMaxX, minZ: eaveMinZ, maxZ: eaveMaxZ });
        expect(levels.length).toBeGreaterThan(1);

        const midX = corner.x + Math.floor(width / 2);

        let checked = 0;
        for (const y of levels) {
            // The two slopes at this height, found in the middle of the house where the roof is
            // certainly present. Everything between them is roofed over, and so is what the gable
            // end has to close off.
            const slopes: number[] = [];
            for (let z = eaveMinZ; z <= eaveMaxZ; z++) {
                if (nameAt(midX, y, z) === 'minecraft:oak_stairs') slopes.push(z);
            }
            if (slopes.length < 2) continue;

            for (let z = slopes[0]!; z <= slopes[slopes.length - 1]!; z++) {
                checked++;
                expect(`z=${z} y=${y} west end: ${nameAt(eaveMinX, y, z)}`).not.toContain('minecraft:air');
                expect(`z=${z} y=${y} east end: ${nameAt(eaveMaxX, y, z)}`).not.toContain('minecraft:air');
            }
        }

        expect(checked).toBeGreaterThan(0);
    });

    it('closes the gable ends when the ridge runs the other way', () => {
        // The two axes are separate branches of the same code, so both have to be checked - it is
        // exactly the sort of thing that gets fixed on one and forgotten on the other.
        const width = 5;
        const depth = 9;
        const { nameAt, corner } = buildHouse({ width, depth, facing: Facing.East });

        const eaveMinX = corner.x - 1;
        const eaveMaxX = corner.x + width;
        const eaveMinZ = corner.z - 1;
        const eaveMaxZ = corner.z + depth;

        const levels = roofLevels(nameAt, { minX: eaveMinX, maxX: eaveMaxX, minZ: eaveMinZ, maxZ: eaveMaxZ });
        expect(levels.length).toBeGreaterThan(1);

        const midZ = corner.z + Math.floor(depth / 2);

        let checked = 0;
        for (const y of levels) {
            const slopes: number[] = [];
            for (let x = eaveMinX; x <= eaveMaxX; x++) {
                if (nameAt(x, y, midZ) === 'minecraft:oak_stairs') slopes.push(x);
            }
            if (slopes.length < 2) continue;

            for (let x = slopes[0]!; x <= slopes[slopes.length - 1]!; x++) {
                checked++;
                expect(`x=${x} y=${y} north end: ${nameAt(x, y, eaveMinZ)}`).not.toContain('minecraft:air');
                expect(`x=${x} y=${y} south end: ${nameAt(x, y, eaveMaxZ)}`).not.toContain('minecraft:air');
            }
        }

        expect(checked).toBeGreaterThan(0);
    });

    it('has a room inside it that a villager can stand up in', () => {
        const { nameAt } = buildHouse({ width: 7, depth: 7, facing: Facing.North });

        // The floor is solid and there is headroom above it.
        expect(nameAt(6, GROUND, 6)).toBe('minecraft:oak_planks');
        expect(nameAt(6, GROUND + 1, 6)).toBe('minecraft:air');
        expect(nameAt(6, GROUND + 2, 6)).toBe('minecraft:air');
    });

    it('has a doorway through the wall it faces', () => {
        const width = 7;
        const depth = 5;
        const { nameAt, corner } = buildHouse({ width, depth, facing: Facing.North });

        // The door is in the middle of the north wall, and is a way through rather than a wall.
        const midX = Math.floor((corner.x + corner.x + width - 1) / 2);
        expect(nameAt(midX, GROUND + 1, corner.z)).toBe('minecraft:wooden_door');
        expect(nameAt(midX, GROUND + 2, corner.z)).toBe('minecraft:wooden_door');
    });

    it('roofs the whole footprint, with nothing open to the sky', () => {
        // Straight down from above every column of the building: something has to stop the rain.
        const width = 7;
        const depth = 7;
        const { nameAt, corner } = buildHouse({ width, depth, facing: Facing.South });

        for (let x = corner.x; x < corner.x + width; x++) {
            for (let z = corner.z; z < corner.z + depth; z++) {
                let covered = false;
                for (let y = GROUND + 14; y > GROUND + 1 && !covered; y--) {
                    if (!isAir(nameAt(x, y, z))) covered = true;
                }

                expect(`${x},${z} covered: ${covered}`).toBe(`${x},${z} covered: true`);
            }
        }
    });
});
