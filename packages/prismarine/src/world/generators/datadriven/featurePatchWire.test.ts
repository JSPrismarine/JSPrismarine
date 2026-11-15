import { serialize, deserialize } from 'node:v8';

import { describe, expect, it } from 'vitest';

import type { RegionBlock, RegionChunkPatch } from './GenerationRegion';
import { packFeaturePatches, unpackFeaturePatches } from './featurePatchWire';

const STONE: RegionBlock = { java: { name: 'minecraft:stone', properties: {} } };
const LOG: RegionBlock = { java: { name: 'minecraft:oak_log', properties: { axis: 'y' } } };

const patch = (writes: number): RegionChunkPatch => ({
    chunkX: 3,
    chunkZ: -2,
    blocks: Array.from({ length: writes }, (_, index) => ({
        x: 48 + (index % 16),
        y: -64 + index,
        z: -32 + (index % 7),
        block: index % 3 === 0 ? LOG : STONE
    })),
    blockEntityRemovals: [{ x: 50, y: 70, z: -30 }],
    blockEntities: [],
    entitySpawns: [],
    fluidTicks: [{ x: 49, y: 62, z: -31 }],
    structureBlocks: [
        { x: 48, y: -64, z: -32 },
        { x: 51, y: 0, z: -20 }
    ]
});

describe('featurePatchWire', () => {
    it('round trips a patch list through the process channel serialization', () => {
        const patches = [patch(1000), patch(0)];
        const { payload } = packFeaturePatches(patches);

        expect(unpackFeaturePatches(deserialize(serialize(payload)))).toEqual(patches);
    });

    it('carries one palette entry per distinct block, however many writes there are', () => {
        const [packed] = packFeaturePatches([patch(5000)]).payload;

        expect(packed?.palette).toHaveLength(2);
    });

    it('lists every buffer it packed for transfer', () => {
        const { payload, transferList } = packFeaturePatches([patch(10), patch(20)]);

        expect(transferList).toHaveLength(payload.length * 3);
    });

    it('refuses a write whose block the palette does not hold', () => {
        const [packed] = packFeaturePatches([patch(4)]).payload;
        if (packed === undefined) throw new Error('no patch was packed');

        expect(() => unpackFeaturePatches([{ ...packed, palette: [STONE] }])).toThrowError(TypeError);
        expect(() => unpackFeaturePatches([{ chunkX: 0 }])).toThrowError('invalid patch list');
    });
});
