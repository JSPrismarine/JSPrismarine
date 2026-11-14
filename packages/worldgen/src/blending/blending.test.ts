import { describe, expect, it } from 'vitest';

import blendingVectors from '../../vectors/blending.json' with { type: 'json' };
import { expectedFloat } from '../../vectors/vectors';
import { floorDiv, floorMod } from '../math';
import { Blender, blendingShiftNoise, newSidesOf } from './Blender';
import type { OldChunkView } from './BlendingData';
import { BLENDING_NO_VALUE, BLENDING_SURFACE_BLOCKS, BlendingData } from './BlendingData';
import {
    GENERATION_DATA_VERSION,
    OLD_GENERATION_BELOW_DATA_VERSION,
    isOldGenerationDataVersion
} from './generationVersion';
import { LongHashOrder, packChunkPos } from './longHashOrder';

/** `DumpBlendingVectors.blockAt`, block for block. */
const blockAt = (x: number, y: number, z: number, minY: number): string => {
    if (y < minY) return 'minecraft:air';
    const height = 62 + floorMod(x * 7 + z * 13, 23);
    const pond = floorMod(x + z * 3, 11) === 0;
    if (y < height - 3) return 'minecraft:stone';
    if (y < height) return 'minecraft:dirt';
    if (y === height) return pond ? 'minecraft:sand' : 'minecraft:grass_block';
    if (pond) return y <= height + 2 ? 'minecraft:water' : 'minecraft:air';
    if (floorMod(x * 5 + z, 17) === 0) {
        if (y <= height + 4) return 'minecraft:cobblestone';
        if (y <= height + 6) return 'minecraft:glass';
        return 'minecraft:air';
    }
    if (floorMod(x * 3 + z * 7, 29) === 0 && y === height + 1) return 'minecraft:red_mushroom_block';
    if (floorMod(x + z, 5) === 0 && y === height + 1) return 'minecraft:short_grass';
    if (floorMod(x - z, 13) === 0 && y === height + 1) return 'minecraft:oak_slab';
    return 'minecraft:air';
};

/** What Java's `isGround` answers for the blocks {@link blockAt} places. */
const GROUND = new Set([
    'minecraft:stone',
    'minecraft:dirt',
    'minecraft:grass_block',
    'minecraft:sand',
    'minecraft:oak_slab',
    'minecraft:cobblestone',
    'minecraft:glass'
]);

const SURFACE = new Set(BLENDING_SURFACE_BLOCKS);

const BIOMES = blendingVectors.biomes;

/** `DumpBlendingVectors.biomeAt`. */
const biomeAt = (quartX: number, quartY: number, quartZ: number): string =>
    BIOMES[floorMod(quartX + quartZ * 2 + floorDiv(quartY, 4), BIOMES.length)]!;

/** `DumpBlendingVectors.noiseValue`, in single precision as Java computes it. */
const noiseValue = (x: number, y: number, z: number): number =>
    Math.fround(Math.fround(floorMod(x * 31 + y * 17 + z * 7, 200) - 100) / 50);

const viewOf = (chunkX: number, chunkZ: number, minY: number): OldChunkView => ({
    isSurfaceBlock: (x, y, z) => SURFACE.has(blockAt(chunkX * 16 + x, y, chunkZ * 16 + z, minY)),
    isGround: (x, y, z) => GROUND.has(blockAt(chunkX * 16 + x, y, chunkZ * 16 + z, minY)),
    noiseBiome: (quartX, quartY, quartZ) => biomeAt(chunkX * 4 + quartX, quartY, chunkZ * 4 + quartZ)
});

const expectedValue = (value: number | string): number =>
    value === 'max' ? BLENDING_NO_VALUE : expectedFloat(Number(value));

/** The old chunks of the vector file, each calculated against its own neighbors. */
const oldChunks = (): Map<string, BlendingData> => {
    const records = new Map<string, BlendingData>();
    for (const record of blendingVectors.records) {
        records.set(
            `${record.x},${record.z}`,
            BlendingData.unpack({ minSection: record.minSection, maxSection: record.maxSection })
        );
    }
    const isOld = (x: number, z: number): boolean => records.has(`${x},${z}`);
    for (const record of blendingVectors.records) {
        const data = records.get(`${record.x},${record.z}`)!;
        data.calculate(viewOf(record.x, record.z, record.minSection * 16), newSidesOf(record.x, record.z, isOld));
    }
    return records;
};

describe('generation data versions', () => {
    it('match what the pinned jar reports', () => {
        expect(GENERATION_DATA_VERSION).toBe(blendingVectors.dataVersion);
        expect(OLD_GENERATION_BELOW_DATA_VERSION).toBe(blendingVectors.oldBelowDataVersion);
    });

    it('call a chunk old below the boundary and treat a missing stamp as 0', () => {
        expect(isOldGenerationDataVersion(undefined)).toBe(true);
        expect(isOldGenerationDataVersion(OLD_GENERATION_BELOW_DATA_VERSION - 1)).toBe(true);
        expect(isOldGenerationDataVersion(OLD_GENERATION_BELOW_DATA_VERSION)).toBe(false);
        expect(isOldGenerationDataVersion(GENERATION_DATA_VERSION)).toBe(false);
    });
});

describe('the blender shift noise', () => {
    it("matches Java's SHIFT_NOISE", () => {
        const positions = [
            [0, 0, 0],
            [1, 0, -1],
            [-37, 12, 91],
            [250, -64, -250],
            [4096, 319, -77]
        ] as const;
        expect(positions.map(([x, y, z]) => blendingShiftNoise().get3(x, y, z))).toEqual(
            blendingVectors.shiftNoise.map(expectedFloat)
        );
    });
});

describe('BlendingData', () => {
    const records = oldChunks();

    it.each(blendingVectors.records.map((record) => [`${record.x},${record.z}`, record] as const))(
        'reads the edges of old chunk %s as Java does',
        (key, record) => {
            const snapshot = records.get(key)!.snapshot();
            const heights = Array.from(snapshot.heights);
            expect(heights).toEqual(
                record.heights.map((height) => (height === null ? BLENDING_NO_VALUE : expectedValue(height)))
            );
            expect(snapshot.densities.map((column) => (column === null ? null : Array.from(column)))).toEqual(
                record.densities.map((column) => (column === null ? null : column.map(expectedValue)))
            );
            expect(
                snapshot.biomes.map((column) =>
                    column === null ? null : column.map((biome) => BIOMES.indexOf(biome)).join('')
                )
            ).toEqual(record.biomes);
        }
    );

    it('survives a snapshot round trip', () => {
        const original = records.get('3,-4')!;
        const copy = BlendingData.fromSnapshot(structuredClone(original.snapshot()));
        expect(copy.pack()).toEqual(original.pack());
        expect(copy.getDensity(0, 9, 0)).toBe(original.getDensity(0, 9, 0));
    });

    it('rejects packed heights of the wrong length', () => {
        expect(() => BlendingData.unpack({ minSection: 0, maxSection: 16, heights: [1, 2, 3] })).toThrow(RangeError);
    });
});

describe('Blender', () => {
    const records = oldChunks();
    const lookup = (x: number, z: number): BlendingData | undefined => records.get(`${x},${z}`);

    it.each(blendingVectors.centers.map((center) => [`${center.x},${center.z}`, center] as const))(
        'blends around chunk %s as Java does',
        (_key, center) => {
            const blender = Blender.of(center.x, center.z, lookup);
            expect(blender.isEmpty()).toBe(center.empty);

            const minX = center.x * 16;
            const minZ = center.z * 16;

            const offsets: number[] = [];
            for (let z = minZ - 4; z < minZ + 20; z += 2) {
                for (let x = minX - 4; x < minX + 20; x += 2) {
                    const output = blender.blendOffsetAndFactor(x, z);
                    offsets.push(output.alpha, output.blendingOffset);
                }
            }
            expect(offsets).toEqual(center.offsets.map(expectedValue));

            const densities: number[] = [];
            for (let z = minZ - 2; z < minZ + 18; z += 5) {
                for (let x = minX - 2; x < minX + 18; x += 5) {
                    for (let y = -72; y <= 330; y += 9)
                        densities.push(blender.blendDensity(x, y, z, noiseValue(x, y, z)));
                }
            }
            expect(densities).toEqual(center.densities.map(expectedValue));

            let biomes = '';
            for (const quartY of [-17, -16, -1, 0, 15, 16, 20, 63, 64, 79, 80]) {
                for (let quartZ = center.z * 4 - 8; quartZ < center.z * 4 + 12; quartZ++) {
                    for (let quartX = center.x * 4 - 8; quartX < center.x * 4 + 12; quartX++) {
                        const biome = blender.blendBiome(quartX, quartY, quartZ);
                        biomes += biome === undefined ? '-' : String(BIOMES.indexOf(biome));
                    }
                }
            }
            expect(biomes).toBe(center.biomes);

            const filter = blender.carvingFilter;
            if (center.carving === null) {
                expect(filter).toBeUndefined();
            } else {
                let carving = '';
                for (let y = -64; y < 320; y += 7) {
                    for (let z = 0; z < 16; z += 3) {
                        for (let x = 0; x < 16; x += 3) carving += filter!(x, y, z) ? '1' : '0';
                    }
                }
                expect(carving).toBe(center.carving);
            }
        }
    );

    it('is empty with no old chunk within seven chunks', () => {
        expect(Blender.of(40, 40, lookup)).toBe(Blender.EMPTY);
        expect(Blender.EMPTY.blendDensity(0, 0, 0, 0.25)).toBe(0.25);
        expect(Blender.EMPTY.blendOffsetAndFactor(0, 0)).toEqual({ alpha: 1, blendingOffset: 0 });
    });
});

describe('LongHashOrder', () => {
    it('keeps the null key first and replaces a value in place', () => {
        const map = new LongHashOrder<string>();
        map.put(packChunkPos(1, 0), 'a');
        map.put(packChunkPos(0, 0), 'zero');
        map.put(packChunkPos(1, 0), 'b');
        expect(map.length).toBe(2);
        expect(map.ordered()[0]).toBe('zero');
        expect(map.get(packChunkPos(1, 0))).toBe('b');
    });

    it("hands values back in fastutil's order after several rehashes", () => {
        const { center, order } = blendingVectors.hashOrder;
        const map = new LongHashOrder<number>();
        let inserted = 0;
        // `Blender.of`'s loop around a center whose circle holds chunk 0, 0.
        for (let dx = -7; dx <= 7; dx++) {
            for (let dz = -7; dz <= 7; dz++) {
                if (dx * dx + dz * dz <= 64) map.put(packChunkPos(center[0]! + dx, center[1]! + dz), inserted++);
            }
        }
        expect(map.length).toBe(order.length);
        expect(map.ordered()).toEqual(order);
    });
});
