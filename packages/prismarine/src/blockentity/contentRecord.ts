/**
 * The translation between a content block entity record and the NBT a chunk holds.
 *
 * The behaviors share an open record, {@link BlockEntityData}: `items`, `capacity`, `text`,
 * `sealed` and whatever else a family decided to keep under its index signature. A chunk holds
 * Bedrock's own block entities, NBT compounds written by every version and behavior pack a world
 * has seen. Neither shape can be derived from the other, so this module states the mapping.
 *
 * A container's `items` becomes Bedrock's own `Items` list, so a chest filled by a behavior is
 * the same compound a vanilla tool reads and the client is sent. `inventory/itemNbt.ts` states
 * what one stack in that list looks like, and a player data record writes its stacks through
 * the same module: a chest and a player's own inventory keep enchantments, durability, an
 * anvil name and lore the same way. Every other field of the record is JSON under one string
 * tag, {@link CONTENT_DATA_TAG}, because Bedrock has no schema for them and inventing an NBT
 * width per field would lose the difference between 1 and 1.0 on the way back. Anything the
 * compound already carried is left where it is, which is the rule {@link BlockEntity} is built
 * around: a world is full of tags this server does not model.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import type { BlockEntityData, ContentPosition } from '../content/world/adapter';
import { ITEMS_TAG, itemSlotsFromNbt, itemSlotsToNbt } from '../inventory/itemNbt';
import { itemDropOf, storedItemDrop } from '../inventory/persistence';
import type { BlockEntity } from './BlockEntity';
import { bedrockBlockEntityIdOf } from './bedrockBlockEntityIds';

/** The tag holding every field of a record that `Items` does not cover, as JSON. */
export const CONTENT_DATA_TAG = 'jsprismarine:data';

/**
 * The record field the container family records a chest's other half under, and Bedrock's own
 * three tags for the same thing.
 *
 * The field is read back through `pairedPosition` in `@jsprismarine/block-behaviors`, and the
 * tags are what the client reads to draw a double chest as one screen.
 */
const PAIRED_WITH_FIELD = 'pairedWith';
const PAIR_X_TAG = 'pairx';
const PAIR_Z_TAG = 'pairz';
const PAIR_LEAD_TAG = 'pairlead';

/** One stack of a container, as the record carries one. */
type RecordItem = NonNullable<NonNullable<BlockEntityData['items']>[number]>;

/** The record's own fields, keyed by name, with `items` taken out. */
type RecordFields = Record<string, unknown>;

/** The slots of a container, read back out of Bedrock's `Items` list. */
const itemsFromNbt = (nbt: NBTTagCompound, capacity: number): readonly (RecordItem | undefined)[] | undefined => {
    if (nbt.getList(ITEMS_TAG, false) === null) return undefined;

    const placed = itemSlotsFromNbt(nbt, ITEMS_TAG);

    // Vanilla writes only the filled slots, so the list length is not the slot count. The record
    // is sparse by slot index, and its length is the capacity when the record states one.
    let size = capacity;
    for (const { slot } of placed) size = Math.max(size, slot + 1);

    const items = new Array<RecordItem | undefined>(size).fill(undefined);
    for (const { slot, stack } of placed) items[slot] = itemDropOf(stack);

    return items;
};

/** Bedrock's `Items` list for the slots a record holds, with the empty ones left out. */
const itemsToNbt = (items: readonly (RecordItem | undefined)[]): Set<NBTTagCompound> =>
    itemSlotsToNbt(items.map((item) => (item === undefined ? null : storedItemDrop(item))));

/** The fields under {@link CONTENT_DATA_TAG}, or nothing when the tag is absent or malformed. */
const fieldsFromNbt = (nbt: NBTTagCompound): RecordFields => {
    const encoded = nbt.getString(CONTENT_DATA_TAG, '');
    if (encoded === '') return {};

    try {
        // Parsed JSON, which the compiler cannot see the shape of. The record it feeds declares
        // an index signature of `unknown`, so nothing downstream reads a field without checking.
        const parsed: unknown = JSON.parse(encoded);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as RecordFields) : {};
    } catch {
        // A tag some other writer put there under the same name. The container's items are still
        // readable, and losing the rest beats refusing to open the chest.
        return {};
    }
};

/**
 * The chest half a compound is paired with, out of Bedrock's own tags.
 *
 * `pairx` and `pairz` are how vanilla records a double chest, and how the client learns to draw
 * one screen of 54 slots over two blocks. The y is the block's own: the two halves of a double
 * chest are side by side, never stacked.
 */
const pairFromNbt = (nbt: NBTTagCompound): { x: number; y: number; z: number } | undefined => {
    if (!nbt.has(PAIR_X_TAG) || !nbt.has(PAIR_Z_TAG)) return undefined;

    return { x: nbt.getNumber(PAIR_X_TAG, 0), y: nbt.getNumber('y', 0), z: nbt.getNumber(PAIR_Z_TAG, 0) };
};

/**
 * The record a behavior reads, out of the compound a chunk holds.
 *
 * @returns The record, with `items` present only when the compound carries an `Items` list.
 */
export const blockEntityRecord = (nbt: NBTTagCompound): BlockEntityData => {
    const fields = fieldsFromNbt(nbt);
    const capacity = typeof fields['capacity'] === 'number' ? fields['capacity'] : 0;
    const items = itemsFromNbt(nbt, capacity);

    // A chest the game itself paired, in a world this server did not write. The field the
    // behaviors read is the same one either way, so a vanilla double chest is a double chest
    // here without the family having to pair it again.
    const paired = fields[PAIRED_WITH_FIELD] === undefined ? pairFromNbt(nbt) : undefined;
    const withPair = paired === undefined ? fields : { ...fields, [PAIRED_WITH_FIELD]: paired };

    return items === undefined ? withPair : { ...withPair, items };
};

/**
 * Writes a record into a compound, leaving every tag the record does not describe alone.
 *
 * @param nbt - The compound to write into, which is mutated.
 * @param data - The whole record, not a patch: a field the record dropped is removed here too.
 */
export const applyBlockEntityRecord = (nbt: NBTTagCompound, data: BlockEntityData): void => {
    const { items, ...fields } = data;

    if (items === undefined) {
        nbt.remove(ITEMS_TAG);
    } else {
        nbt.addValue(ITEMS_TAG, itemsToNbt(items));
    }

    applyPairToNbt(nbt, fields[PAIRED_WITH_FIELD]);

    const encoded = JSON.stringify(fields);
    if (encoded === undefined || encoded === '{}') {
        nbt.remove(CONTENT_DATA_TAG);
    } else {
        nbt.addValue(CONTENT_DATA_TAG, new Types.StringVal(encoded));
    }
};

/**
 * Writes a chest's pair under Bedrock's own tags beside the record's own field.
 *
 * The client decides whether to draw one screen of 54 slots from these, so a double chest that
 * only had `pairedWith` under {@link CONTENT_DATA_TAG} was 54 slots on the server and 27 on the
 * screen. `pairlead` goes on the half with the lower `x` and then `z`, which is the half the
 * server orders the slots from.
 */
const applyPairToNbt = (nbt: NBTTagCompound, paired: unknown): void => {
    const partner = positionOf(paired);
    if (partner === undefined) {
        nbt.remove(PAIR_X_TAG);
        nbt.remove(PAIR_Z_TAG);
        nbt.remove(PAIR_LEAD_TAG);
        return;
    }

    const [x, z] = [nbt.getNumber('x', 0), nbt.getNumber('z', 0)];
    const lead = x !== partner.x ? x < partner.x : z < partner.z;

    nbt.addValue(PAIR_X_TAG, new Types.NumberVal(partner.x));
    nbt.addValue(PAIR_Z_TAG, new Types.NumberVal(partner.z));
    nbt.addValue(PAIR_LEAD_TAG, new Types.ByteVal(lead ? 1 : 0));
};

/** A `{ x, y, z }` out of an open record field, or undefined when the field is not one. */
const positionOf = (value: unknown): { x: number; y: number; z: number } | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;
    if (!('x' in value) || !('y' in value) || !('z' in value)) return undefined;

    const { x, y, z } = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
    return { x, y, z };
};

/**
 * The `id` a new block entity is filed under.
 *
 * Vanilla's own spelling where Bedrock has one, from {@link bedrockBlockEntityIdOf}. It used to
 * be the block's name in Pascal case, checked against the types this server models, which is a
 * different question: a sign's id came out `jsprismarine:standing_sign`, because Bedrock calls
 * the type `Sign` and this server has no `StandingSign` class to recognize the guess. A client
 * ignores an id it does not know, so every sign ever placed was a compound the client dropped.
 *
 * A block Bedrock keeps no block entity on still gets a namespaced id. The compound round-trips
 * through {@link import('./GenericBlockEntity').GenericBlockEntity}, and a record this server
 * invented is better named after this server than after a vanilla type it is not.
 */
export const blockEntityIdFor = (blockIdentifier: string): string =>
    bedrockBlockEntityIdOf(blockIdentifier) ?? `jsprismarine:${blockIdentifier.replace(/^[^:]*:/, '')}`;

/**
 * The compound a position starts from: the one already there, or a new one for the block standing
 * there.
 */
export const blockEntityCompound = (
    existing: BlockEntity | null,
    at: ContentPosition,
    blockIdentifier: string
): NBTTagCompound => {
    if (existing !== null) return existing.toNBT();

    const nbt = new NBTTagCompound('');
    nbt.addValue('id', new Types.StringVal(blockEntityIdFor(blockIdentifier)));
    nbt.addValue('x', new Types.NumberVal(at.x));
    nbt.addValue('y', new Types.NumberVal(at.y));
    nbt.addValue('z', new Types.NumberVal(at.z));
    nbt.addValue('isMovable', new Types.ByteVal(1));

    return nbt;
};
