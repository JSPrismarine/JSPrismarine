import type { NBTTagCompound } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { blockEntityChanges } from '../../blockentity/blockEntityLog';
import { BlockEntityRegistry } from '../../blockentity/BlockEntityRegistry';
import { blockEntityEntries, blockEntry, chestTags } from '../../testing/sealedBlocks.test.helper';
import { BlockReplica } from './BlockReplica';

/** A replica holding `count` chests in chunk (0, 0), the first at (0, 64, 0). */
const replicaHolding = (count: number): BlockReplica => {
    const replica = new BlockReplica();
    const chests: NBTTagCompound[] = [];
    for (let index = 0; index < count; index++)
        chests.push(
            chestTags({ x: index % 16, y: 64 + (index >> 8), z: (index >> 4) % 16 }, { 0: ['minecraft:dirt', 1] })
        );
    replica.chunkEntered(0, 0, chests);
    return replica;
};

describe('the block replica', () => {
    it('keeps the last runtime id of each block in the order each was first written, and shown blocks with them', () => {
        const replica = new BlockReplica();

        const { blocks, blockEntities } = replica.read({
            tick: 1,
            entries: [
                blockEntry({ x: 1, y: 64, z: 1 }, 5),
                blockEntry({ x: 2, y: 64, z: 2 }, 6),
                blockEntry({ x: 1, y: 64, z: 1 }, 7),
                blockEntry({ x: 3, y: 64, z: 3 }, 8, 1),
                { kind: 'occurrence', occurrence: 'block-shown', data: { x: 4, y: 64, z: 4, block: 9 } }
            ]
        });

        expect([...blocks.values()]).toEqual([
            { x: 1, y: 64, z: 1, block: 7 },
            { x: 2, y: 64, z: 2, block: 6 },
            { x: 4, y: 64, z: 4, block: 9 }
        ]);
        expect(blockEntities.size).toBe(0);
    });

    it('folds a block entity seeded with its chunk and changed by one slot into its whole compound', () => {
        const at = { x: 3, y: 64, z: 3 };
        const before = chestTags(at, { 0: ['minecraft:dirt', 4], 5: ['minecraft:stone', 9] });
        const after = chestTags(at, { 0: ['minecraft:dirt', 4], 5: ['minecraft:stone', 9], 7: ['minecraft:glass', 1] });
        const replica = new BlockReplica();
        replica.chunkEntered(0, 0, [before]);

        const entries = blockEntityEntries(at, before, after);
        const { blockEntities } = replica.read({ tick: 1, entries });

        expect(entries).toHaveLength(1);
        expect([...blockEntities.values()]).toEqual([at]);
        // In the form the chest's own `toNBT` writes, which is what the chunk holds and sends.
        expect(blockEntityChanges(replica.compound(at), BlockEntityRegistry.fromNBT(after).toNBT())).toEqual([]);
    });

    it('forgets a block entity the log removed, and every block entity of a chunk that left', () => {
        const at = { x: 3, y: 64, z: 3 };
        const chest = chestTags(at, { 0: ['minecraft:dirt', 4] });
        const replica = new BlockReplica();
        replica.chunkEntered(0, 0, [chest, chestTags({ x: 4, y: 64, z: 4 }, {})]);

        replica.read({ tick: 1, entries: blockEntityEntries(at, chest, null) });
        expect(replica.compound(at)).toBeNull();
        expect(replica.counts().blockEntities).toBe(1);

        replica.chunkLeft(0, 0);
        expect(replica.counts().blockEntities).toBe(0);
    });

    it('passes over a block entity field in a chunk it does not hold', () => {
        const at = { x: 40, y: 64, z: 40 };
        const replica = new BlockReplica();

        const { blockEntities } = replica.read({ tick: 1, entries: blockEntityEntries(at, null, chestTags(at, {})) });

        expect(blockEntities.size).toBe(0);
        expect(replica.compound(at)).toBeNull();
    });

    // The slice 7 target "Replication visits entities in proportion to log entries, not to the
    // number of entities", for blocks and block entities.
    it.each([1, 1000])(
        'reads the entries of a tick and folds the positions it names, holding %i block entities',
        (held) => {
            const replica = replicaHolding(held);
            const at = { x: 0, y: 64, z: 0 };
            const before = chestTags(at, { 0: ['minecraft:dirt', 1] });
            const entries = [
                ...blockEntityEntries(
                    at,
                    before,
                    chestTags(at, { 0: ['minecraft:dirt', 1], 1: ['minecraft:stone', 2] })
                ),
                blockEntry({ x: 9, y: 70, z: 9 }, 5),
                blockEntry({ x: 9, y: 71, z: 9 }, 5)
            ];

            const { blockEntities } = replica.read({ tick: 1, entries });
            for (const position of blockEntities.values()) replica.compound(position);

            expect(replica.counts()).toMatchObject({ blockEntities: held, entriesRead: entries.length, folded: 1 });
        }
    );
});
