import type { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import type { BlockEntity } from './BlockEntity';
import type { BlockEntityWorld } from './blockEntityWrite';
import { writeBlockEntity } from './blockEntityWrite';

/**
 * The one place a block entity is written into a chunk while players are watching.
 *
 * Two things are asserted here and nowhere else: that the write reaches the chunk *and* the
 * report, and that a write changing nothing reaches neither. The second one is what keeps a
 * comparator restating its signal on every tick it runs from costing a packet to everyone
 * nearby and a chunk re-serialization on top.
 */

/** A chunk holding block entities by position, plus a count of the writes it took. */
const chunkHolding = () => {
    const held = new Map<string, BlockEntity>();
    let writes = 0;

    const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

    return {
        get writes() {
            return writes;
        },
        held,
        chunk: {
            getBlockEntity: (x: number, y: number, z: number) => held.get(key(x, y, z)) ?? null,
            setBlockEntity: (entity: BlockEntity) => {
                writes++;
                const at = entity.getPosition();
                held.set(key(at.getX(), at.getY(), at.getZ()), entity);
            }
        }
    };
};

const worldHolding = () => {
    const chunks = chunkHolding();
    const reported: { position: Vector3; tags: NBTTagCompound }[] = [];

    const world: BlockEntityWorld = {
        getLoadedChunk: () => chunks.chunk,
        blockEntityChanged: (position, tags) => void reported.push({ position, tags })
    };

    return { world, chunks, reported };
};

/** A chest compound at a position, holding `label` under a tag the chest model does not take. */
const chestTags = (at: { x: number; y: number; z: number }, label: string): NBTTagCompound => {
    const tags = new NBTTagCompound('');
    tags.addValue('id', new Types.StringVal('Chest'));
    tags.addValue('x', new Types.NumberVal(at.x));
    tags.addValue('y', new Types.NumberVal(at.y));
    tags.addValue('z', new Types.NumberVal(at.z));
    tags.addValue('CustomName', new Types.StringVal(label));

    return tags;
};

const AT = { x: 33, y: 70, z: -18 };

describe('blockentity', () => {
    describe('writeBlockEntity', () => {
        it('files the block entity and reports it', () => {
            const { world, chunks, reported } = worldHolding();

            expect(writeBlockEntity(world, chestTags(AT, 'loot'))).toBe(true);

            expect(chunks.writes).toBe(1);
            expect(reported).toHaveLength(1);
            expect([
                reported[0]!.position.getX(),
                reported[0]!.position.getY(),
                reported[0]!.position.getZ()
            ]).toStrictEqual([AT.x, AT.y, AT.z]);
        });

        it('reports the compound the chunk would serialize, not the one it was handed', () => {
            // The report is what a client is sent, so it has to be what the chunk holds. A
            // class lifts the fields it models out of the compound and puts them back in
            // `toNBT`, and reporting the compound before that round trip could differ from it.
            const { world, chunks, reported } = worldHolding();

            writeBlockEntity(world, chestTags(AT, 'loot'));

            const held = [...chunks.held.values()][0]!;
            expect(reported[0]!.tags).toStrictEqual(held.toNBT());
            expect(reported[0]!.tags.getString('CustomName', '')).toBe('loot');
        });

        it('says nothing and writes nothing when the compound is what is already there', () => {
            const { world, chunks, reported } = worldHolding();
            writeBlockEntity(world, chestTags(AT, 'loot'));

            // What an unconditional per-tick writer does. The chunk drops its serialization
            // cache on every `setBlockEntity`, so a write that changes nothing is not free
            // even before it reaches the network.
            for (let tick = 0; tick < 20; tick++) {
                expect(writeBlockEntity(world, chestTags(AT, 'loot'))).toBe(false);
            }

            expect(chunks.writes).toBe(1);
            expect(reported).toHaveLength(1);
        });

        it('reports a compound that differs by one tag', () => {
            const { world, reported } = worldHolding();
            writeBlockEntity(world, chestTags(AT, 'loot'));

            expect(writeBlockEntity(world, chestTags(AT, 'spoils'))).toBe(true);

            expect(reported).toHaveLength(2);
            expect(reported[1]!.tags.getString('CustomName', '')).toBe('spoils');
        });

        it('tells positions apart', () => {
            const { world, reported } = worldHolding();

            writeBlockEntity(world, chestTags(AT, 'loot'));
            writeBlockEntity(world, chestTags({ ...AT, z: AT.z + 1 }, 'loot'));

            // The same tags one block over is a different block entity, not a repeat.
            expect(reported).toHaveLength(2);
        });

        it('does nothing when the chunk is not in memory', () => {
            const reported: Vector3[] = [];
            const world: BlockEntityWorld = {
                getLoadedChunk: () => null,
                blockEntityChanged: (position) => void reported.push(position)
            };

            expect(writeBlockEntity(world, chestTags(AT, 'loot'))).toBe(false);
            expect(reported).toEqual([]);
        });

        it('reports a type the server does not model', () => {
            // A block entity from a version or a behavior pack this server knows nothing about
            // still round-trips, and a client that recognizes it still has to be told.
            const { world, reported } = worldHolding();

            const tags = new NBTTagCompound('');
            tags.addValue('id', new Types.StringVal('Vault'));
            tags.addValue('x', new Types.NumberVal(AT.x));
            tags.addValue('y', new Types.NumberVal(AT.y));
            tags.addValue('z', new Types.NumberVal(AT.z));
            tags.addValue('ominous', new Types.ByteVal(1));

            expect(writeBlockEntity(world, tags)).toBe(true);
            expect(reported[0]!.tags.getByte('ominous', 0)).toBe(1);
        });
    });
});
