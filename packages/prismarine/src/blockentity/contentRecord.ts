/**
 * The translation between a content block entity record and the NBT a chunk holds.
 *
 * The behaviors share an open record, {@link BlockEntityData}: `items`, `capacity`, `text`,
 * `sealed` and whatever else a family decided to keep under its index signature. A chunk holds
 * Bedrock's own block entities, NBT compounds written by every version and behavior pack a world
 * has seen. Neither shape can be derived from the other, so this module states the mapping.
 *
 * A container's `items` becomes Bedrock's own `Items` list, so a chest filled by a behavior is
 * the same compound a vanilla tool reads and the client is sent. Every other field of the record
 * is JSON under one string tag, {@link CONTENT_DATA_TAG}, because Bedrock has no schema for them
 * and inventing an NBT width per field would lose the difference between 1 and 1.0 on the way
 * back. Anything the compound already carried is left where it is, which is the rule
 * {@link BlockEntity} is built around: a world is full of tags this server does not model.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import type { BlockEntityData, ContentPosition } from '../content/world/adapter';
import type { BlockEntity } from './BlockEntity';
import { BlockEntityRegistry } from './BlockEntityRegistry';

/** The tag holding every field of a record that `Items` does not cover, as JSON. */
export const CONTENT_DATA_TAG = 'jsprismarine:data';

/** Bedrock's own container list, which `items` maps onto. */
const ITEMS_TAG = 'Items';

/** One stack of a container, as the record carries one. */
type RecordItem = NonNullable<NonNullable<BlockEntityData['items']>[number]>;

/** The record's own fields, keyed by name, with `items` taken out. */
type RecordFields = Record<string, unknown>;

/** The slots of a container, read back out of Bedrock's `Items` list. */
const itemsFromNbt = (nbt: NBTTagCompound, capacity: number): readonly (RecordItem | undefined)[] | undefined => {
    const list = nbt.getList(ITEMS_TAG, false);
    if (list === null) return undefined;

    const placed: { slot: number; item: RecordItem }[] = [];
    for (const entry of list) {
        if (!(entry instanceof NBTTagCompound)) continue;

        const identifier = entry.getString('Name', '');
        if (identifier === '') continue;

        placed.push({
            slot: entry.getByte('Slot', placed.length),
            item: { identifier, count: entry.getByte('Count', 1) }
        });
    }

    // Vanilla writes only the filled slots, so the list length is not the slot count. The record
    // is sparse by slot index, and its length is the capacity when the record states one.
    let size = capacity;
    for (const { slot } of placed) size = Math.max(size, slot + 1);

    const items = new Array<RecordItem | undefined>(size).fill(undefined);
    for (const { slot, item } of placed) items[slot] = item;

    return items;
};

/** Bedrock's `Items` list for the slots a record holds, with the empty ones left out. */
const itemsToNbt = (items: readonly (RecordItem | undefined)[]): Set<NBTTagCompound> => {
    const list = new Set<NBTTagCompound>();

    items.forEach((item, slot) => {
        if (item === undefined) return;

        const entry = new NBTTagCompound('');
        entry.addValue('Name', new Types.StringVal(item.identifier));
        entry.addValue('Count', new Types.ByteVal(item.count));
        entry.addValue('Damage', new Types.ShortVal(0));
        entry.addValue('Slot', new Types.ByteVal(slot));
        list.add(entry);
    });

    return list;
};

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
 * The record a behavior reads, out of the compound a chunk holds.
 *
 * @returns The record, with `items` present only when the compound carries an `Items` list.
 */
export const blockEntityRecord = (nbt: NBTTagCompound): BlockEntityData => {
    const fields = fieldsFromNbt(nbt);
    const capacity = typeof fields['capacity'] === 'number' ? fields['capacity'] : 0;
    const items = itemsFromNbt(nbt, capacity);

    return items === undefined ? fields : { ...fields, items };
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

    const encoded = JSON.stringify(fields);
    if (encoded === undefined || encoded === '{}') {
        nbt.remove(CONTENT_DATA_TAG);
    } else {
        nbt.addValue(CONTENT_DATA_TAG, new Types.StringVal(encoded));
    }
};

/** `minecraft:trapped_chest` as vanilla's block entity id would spell it: `TrappedChest`. */
const pascalCase = (identifier: string): string =>
    identifier
        .replace(/^[^:]*:/, '')
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

/**
 * The `id` a new block entity is filed under.
 *
 * Vanilla's ids are the block's name in Pascal case for most of the modeled types, so the
 * candidate is checked against {@link BlockEntityRegistry}, which is this server's own list of
 * them, rather than against a second copy of that list kept here. A block whose candidate is not
 * a type the server models gets a namespaced id instead of a guessed vanilla one: the compound
 * still round-trips through {@link import('./GenericBlockEntity').GenericBlockEntity}, and a
 * client that does not recognize the id skips it rather than drawing the wrong thing.
 */
export const blockEntityIdFor = (blockIdentifier: string): string => {
    const candidate = pascalCase(blockIdentifier);
    return BlockEntityRegistry.isModeled(candidate)
        ? candidate
        : `jsprismarine:${blockIdentifier.replace(/^[^:]*:/, '')}`;
};

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
