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
    fluidTicks: [
        { x: 49, y: 62, z: -31 },
        { x: 50, y: 63, z: -30, postProcess: true }
    ],
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

    it('passes packed writes on with their own arrays, and keeps them off the transfer list', () => {
        const [once] = unpackFeaturePatches(packFeaturePatches([patch(30)]).payload);
        if (!(once?.blocks instanceof PackedBlockWrites)) throw new Error('the writes came back unpacked');

        const { payload, transferList } = packFeaturePatches([once]);

        // The patch still belongs to the chunk that holds it, which a retried merge reads again.
        expect(payload[0]?.palette).toBe(once.blocks.palette);
        expect(payload[0]?.writePositions).toBe(once.blocks.positions.buffer);
        expect(payload[0]?.writeBlocks).toBe(once.blocks.slots.buffer);
        expect(transferList).not.toContain(once.blocks.positions.buffer);
        expect(transferList).not.toContain(once.blocks.slots.buffer);
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
