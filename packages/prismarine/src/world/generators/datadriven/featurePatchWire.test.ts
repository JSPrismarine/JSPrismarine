import { serialize, deserialize } from 'node:v8';

import { describe, expect, it } from 'vitest';

import type { RegionBlock, RegionBlockWrite, RegionBlockWrites, RegionChunkPatch } from './GenerationRegion';
import { forEachBlockWrite, PackedBlockWrites } from './GenerationRegion';
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

/** A patch's writes spelled out, whichever form they are in. */
const writesOf = (writes: RegionBlockWrites): RegionBlockWrite[] => {
    const spelled: RegionBlockWrite[] = [];
    forEachBlockWrite(writes, (x, y, z, block) => spelled.push({ x, y, z, block }));
    return spelled;
};

describe('featurePatchWire', () => {
    it('round trips a patch list through the process channel serialization', () => {
        const patches = [patch(1000), patch(0)];
        const { payload } = packFeaturePatches(patches);

        const unpacked = unpackFeaturePatches(deserialize(serialize(payload)));

        // The writes stay packed; spelled out, they are the ones that went in, in order.
        for (const each of unpacked) expect(each.blocks).toBeInstanceOf(PackedBlockWrites);
        expect(unpacked.map((each) => ({ ...each, blocks: writesOf(each.blocks) }))).toEqual(patches);
    });

    it('packs writes that are already packed, as a patch passed on again is', () => {
        const once = unpackFeaturePatches(packFeaturePatches([patch(30)]).payload);
        const twice = unpackFeaturePatches(packFeaturePatches(once).payload);

        expect(twice.map((each) => writesOf(each.blocks))).toEqual([patch(30).blocks]);
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
