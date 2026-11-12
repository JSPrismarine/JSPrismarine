/**
 * A block entity as the change log records it
 * ([ADR 0012](../../../../docs/adr/0012-the-change-log-is-the-history.md)).
 *
 * A block entity is addressed by its block position, and its state is split into fields:
 *
 * - `data`, every tag but the position and the stacks of its `Items`, which stays in `data` as an
 *   empty list so the tags keep their order;
 * - `items.<slot>`, one stack of `Items`, for each slot a stack names.
 *
 * So a stack moved into a chest is one entry, and a furnace's progress is one entry a tick. A
 * value is the field's tags as network NBT bytes, which keeps every tag type a plain number would
 * lose, or null where there is no block entity or the slot is empty. A block entity appears with
 * `data` first and disappears with `data` last, so undoing a span, which applies inverses newest
 * first, always finds the block entity a slot belongs to.
 *
 * An `Items` list whose stacks do not each name a distinct slot is not split. It stays whole in
 * `data`, which is still exact, only coarser.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { nbtBytesOf, nbtOfBytes } from '../nbtBytes';

/** The field that holds everything of a block entity but its stacks. */
export const BLOCK_ENTITY_DATA = 'data';

/** The list a container keeps its stacks in, which Bedrock and Java both call `Items`. */
const ITEMS = 'Items';

const SLOT_PREFIX = 'items.';

/** The field one slot's stack is logged under. */
export const slotField = (slot: number): string => `${SLOT_PREFIX}${slot}`;

/** What one field holds in the change log: its tags as network NBT, or null for nothing. */
export type BlockEntityValue = Uint8Array | null;

/**
 * A logged field's value as the type it was written with, for a reader of the log, whose entries
 * hold any plain data.
 * @throws {TypeError} When the value is neither bytes nor null.
 */
export const blockEntityValueOf = (value: unknown): BlockEntityValue => {
    if (value === null || value instanceof Uint8Array) return value;
    throw new TypeError(`A logged block entity field holds ${String(value)}`);
};

/** One field of a block entity that a write changed. */
export type BlockEntityFieldChange = {
    readonly field: string;
    readonly before: BlockEntityValue;
    readonly after: BlockEntityValue;
};

/** The stacks of a list by the slot each names, or undefined when they do not each name a distinct one. */
const slotsOf = (list: unknown): Map<number, NBTTagCompound> | undefined => {
    if (!(list instanceof Set)) return undefined;
    const slots = new Map<number, NBTTagCompound>();
    for (const stack of list) {
        if (!(stack instanceof NBTTagCompound) || !stack.has('Slot')) return undefined;
        const slot = stack.getByte('Slot', -1);
        if (slots.has(slot)) return undefined;
        slots.set(slot, stack);
    }
    return slots;
};

/** A block entity's tags as its logged fields, `data` first and then the slots in ascending order. */
const fieldsOf = (tags: NBTTagCompound | null): Map<string, Uint8Array> => {
    const fields = new Map<string, Uint8Array>();
    if (tags === null) return fields;

    const data = new NBTTagCompound(tags.getName() ?? '');
    let slots: Map<number, NBTTagCompound> | undefined;
    for (const [key, value] of tags.entries()) {
        if (key === 'x' || key === 'y' || key === 'z') continue;
        if (key === ITEMS) slots = slotsOf(value);
        data.children.set(key, slots !== undefined && key === ITEMS ? new Set() : value);
    }
    fields.set(BLOCK_ENTITY_DATA, nbtBytesOf(data));
    for (const slot of [...(slots?.keys() ?? [])].sort((left, right) => left - right))
        fields.set(slotField(slot), nbtBytesOf(slots!.get(slot)!));
    return fields;
};

const sameBytes = (left: Uint8Array | undefined, right: Uint8Array | undefined): boolean => {
    if (left === undefined || right === undefined) return left === right;
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
    return true;
};

/**
 * The fields a write changed, in the order the log takes them.
 *
 * @param before - The block entity's tags before the write, or null when there was none.
 * @param after - Its tags after it, or null when the write removed it.
 */
export const blockEntityChanges = (
    before: NBTTagCompound | null,
    after: NBTTagCompound | null
): BlockEntityFieldChange[] => {
    const was = fieldsOf(before);
    const is = fieldsOf(after);
    const changes: BlockEntityFieldChange[] = [];
    for (const field of new Set([...was.keys(), ...is.keys()])) {
        const old = was.get(field);
        const now = is.get(field);
        if (!sameBytes(old, now)) changes.push({ field, before: old ?? null, after: now ?? null });
    }
    // A removal ends with `data`, so its inverse starts by putting the block entity back.
    if (after === null) changes.reverse();
    return changes;
};

/** The slot a field names, or undefined for `data`. */
const slotNamed = (field: string): number | undefined => {
    if (!field.startsWith(SLOT_PREFIX)) return undefined;
    const slot = Number(field.slice(SLOT_PREFIX.length));
    if (!Number.isInteger(slot)) throw new TypeError(`A block entity has no field ${field}`);
    return slot;
};

/**
 * The tags a block entity holds once one logged field is written back, which is how an undo
 * puts it back.
 *
 * @param current - The tags standing at the position now, or null when nothing stands there.
 * @param at - The position, which `data` leaves out.
 * @param field - The field to write.
 * @param value - The value to write into it.
 * @returns The tags to file at the position, or null when the block entity goes.
 * @throws {TypeError} When a slot is written where no block entity stands, or the field is unknown.
 */
export const withBlockEntityField = (
    current: NBTTagCompound | null,
    at: { readonly x: number; readonly y: number; readonly z: number },
    field: string,
    value: BlockEntityValue
): NBTTagCompound | null => {
    const slot = slotNamed(field);
    if (slot === undefined) {
        if (field !== BLOCK_ENTITY_DATA) throw new TypeError(`A block entity has no field ${field}`);
        if (value === null) return null;
        const tags = nbtOfBytes(value);
        // The stacks are fields of their own, so `data` takes whatever stands in the slots now.
        const standing = slotsOf(current?.getList(ITEMS, false));
        const placeholder = tags.getList(ITEMS, false);
        if (standing !== undefined && placeholder !== null && placeholder.size === 0)
            tags.children.set(ITEMS, new Set(standing.values()));
        tags.addValue('x', new Types.NumberVal(at.x));
        tags.addValue('y', new Types.NumberVal(at.y));
        tags.addValue('z', new Types.NumberVal(at.z));
        return tags;
    }

    if (current === null) throw new TypeError(`No block entity at ${at.x}, ${at.y}, ${at.z} holds slot ${slot}`);
    const standing = slotsOf(current.getList(ITEMS, false));
    // A list that does not split is whole in `data`, which a change to one writes ahead of
    // emptying the slots the list had, so a replay forward keeps it rather than emptying it.
    if (standing === undefined && value === null) return current;
    const slots = standing ?? new Map<number, NBTTagCompound>();
    if (value === null) slots.delete(slot);
    else slots.set(slot, nbtOfBytes(value));
    const tags = new NBTTagCompound(current.getName() ?? '');
    for (const [key, tag] of current.entries()) tags.children.set(key, tag);
    // In place where the list stood, its stacks in slot order, which is how every writer here keeps them.
    tags.children.set(
        ITEMS,
        new Set([...slots.keys()].sort((left, right) => left - right).map((key) => slots.get(key)))
    );
    return tags;
};
