/**
 * Block and block entity writes as the change log holds them, and sealed ticks of them, which is
 * how a world hands its block changes to its change sink. A replicator test feeds these to
 * `tickSealed` where a world would.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { blockEntityChanges } from '../blockentity/blockEntityLog';
import type { EntityStore } from '../entity/data/EntityStore';
import { BlockReplica } from '../network/replica/BlockReplica';
import type { ChangeEntry } from '../world/changelog/ChangeEntry';
import { isBlockEntry } from '../world/changelog/ChangeEntry';
import type { SealedTick } from '../world/changelog/ChangeLog';
import type { WorldChangeSink } from '../world/WorldChangeSink';
import { NULL_WORLD_CHANGE_SINK } from '../world/WorldChangeSink';

/** A block position, as a plain record or a vector. */
type At =
    { readonly x: number; readonly y: number; readonly z: number } | { getX(): number; getY(): number; getZ(): number };

const plain = (at: At) => ('getX' in at ? { x: at.getX(), y: at.getY(), z: at.getZ() } : { x: at.x, y: at.y, z: at.z });

/** A chest's tags at a position, holding the given stacks by slot. */
export const chestTags = (at: At, stacks: Record<number, [string, number]>): NBTTagCompound => {
    const { x, y, z } = plain(at);
    const tags = new NBTTagCompound('');
    tags.addValue('id', new Types.StringVal('Chest'));
    tags.addValue('x', new Types.NumberVal(x));
    tags.addValue('y', new Types.NumberVal(y));
    tags.addValue('z', new Types.NumberVal(z));
    const items = new Set<NBTTagCompound>();
    for (const [slot, [name, count]] of Object.entries(stacks)) {
        const stack = new NBTTagCompound('');
        stack.addValue('Name', new Types.StringVal(name));
        stack.addValue('Count', new Types.ByteVal(count));
        stack.addValue('Slot', new Types.ByteVal(Number(slot)));
        items.add(stack);
    }
    tags.addValue('Items', items);
    return tags;
};

/** The entry for a write of the block at a position. */
export const blockEntry = (at: At, block: number, layer = 0): ChangeEntry => ({
    kind: 'field',
    field: 'block',
    address: { ...plain(at), layer },
    before: 0,
    after: block
});

/** The entries the world logs for the block entity at a position going from `before` to `after`. */
export const blockEntityEntries = (
    at: At,
    before: NBTTagCompound | null,
    after: NBTTagCompound | null
): ChangeEntry[] => {
    const address = plain(at);
    return blockEntityChanges(before, after).map(({ field, before: was, after: is }) => ({
        kind: 'field',
        field: 'block-entity',
        address: { ...address, field },
        before: was,
        after: is
    }));
};

let ticks = 0;

/** A sealed tick of these entries, numbered after every tick this helper made before. */
const sealedTick = (entries: ChangeEntry[]): SealedTick => ({ tick: ++ticks, entries });

/** Hands a sink one sealed tick that writes the block at a position. */
export const sealBlockWrite = (sink: Pick<WorldChangeSink, 'tickSealed'>, at: At, block: number): void =>
    sink.tickSealed(sealedTick([blockEntry(at, block)]));

/** Hands a sink one sealed tick that changes the block entity at a position from `before` to `after`. */
export const sealBlockEntityWrite = (
    sink: Pick<WorldChangeSink, 'tickSealed'>,
    at: At,
    before: NBTTagCompound | null,
    after: NBTTagCompound | null
): void => sink.tickSealed(sealedTick(blockEntityEntries(at, before, after)));

/**
 * A change sink that reads each sealed tick into a block replica, as the replicator does, and
 * keeps the ticks it read.
 */
export const replicaSink = () => {
    const replica = new BlockReplica();
    const sealed: SealedTick[] = [];
    const sink: WorldChangeSink = {
        ...NULL_WORLD_CHANGE_SINK,
        tickSealed: (tick) => {
            sealed.push(tick);
            replica.read(tick);
        },
        chunkEntered: (x, z, blockEntities) => replica.chunkEntered(x, z, blockEntities),
        chunkLeft: (x, z) => replica.chunkLeft(x, z)
    };
    /** The block, block entity and shown block entries of every tick the sink read, in order. */
    const blockEntries = (): ChangeEntry[] => sealed.flatMap(({ entries }) => entries.filter(isBlockEntry));
    return { sink, replica, sealed, blockEntries };
};

/**
 * Seals a store's open tick and opens the next, as a world's tick does.
 * @returns What each block entry of the sealed tick changed, in order: `block`, `block-entity` or
 *   `block-shown`.
 */
export const sealBlockKinds = (store: EntityStore): string[] => {
    const entries = store.sealTick()?.entries ?? [];
    store.beginTick();
    return entries
        .filter(isBlockEntry)
        .map((entry) =>
            entry.kind === 'field' ? entry.field : entry.kind === 'occurrence' ? entry.occurrence : entry.kind
        );
};
