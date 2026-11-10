/**
 * One inventory slot as the change log records it
 * ([ADR 0012](../../../../docs/adr/0012-the-change-log-is-the-history.md)).
 *
 * A slot's logged value is the stack a player record saves for it, as plain data, or null for an
 * empty slot. That is the state a save keeps and the digest reads, so writing a logged value back
 * restores what matters. What the value leaves out is session state: a stack network id is the
 * client's name for the stack, and an undone write hands the stack a fresh one.
 */
import type ContainerEntry from './ContainerEntry';
import { isStoredItemStack, restoredItem, storedItem, storedStack } from './persistence';
import type { Item } from '../item/Item';
import type { ServerContent } from '../content/ServerContent';
import type { PlainData, PlainRecord } from '../world/changelog/PlainData';
import { isPlainRecord, plainOf } from '../world/changelog/PlainData';

/** What a slot holds in the change log: the stack's saved form, or null for an empty slot. */
export type SlotValue = PlainRecord | null;

/** Hears one write to a slot, with the slot's logged value before and after it. */
export type SlotObserver = (slot: number, before: SlotValue, after: SlotValue) => void;

/** The containers a player carries, as an `inventory-slot` entry names them. */
export const PLAYER_CONTAINERS = ['inventory', 'armor', 'offhand', 'ender_chest', 'cursor', 'crafting'] as const;

/** One of the containers a player carries. */
export type PlayerContainer = (typeof PLAYER_CONTAINERS)[number];

/** The container a logged entry names, or undefined for a name no player container has. */
export const playerContainerNamed = (name: string): PlayerContainer | undefined =>
    PLAYER_CONTAINERS.find((container) => container === name);

const plainSlot = (stored: ReturnType<typeof storedItem>): SlotValue => {
    if (stored === null) return null;
    const plain = plainOf(stored);
    if (plain === undefined || !isPlainRecord(plain))
        throw new TypeError(`A stored stack has no plain form: ${stored.name}`);
    return plain;
};

/** The logged value of a slot that holds `entry`. */
export const slotValueOf = (entry: ContainerEntry | null): SlotValue => plainSlot(storedStack(entry));

/** The logged value of a slot that holds `item`, such as the cursor or a crafting slot. */
export const slotValueOfItem = (item: Item | null): SlotValue => (item === null ? null : plainSlot(storedItem(item)));

/**
 * The item a logged slot value describes, or null for an empty slot.
 *
 * @param content - The content build, which decides the item's maximum durability.
 * @throws {TypeError} When the value is not a stored stack. Only the inventory writes these
 *   values, so a wrong shape is a bug, and a store that cannot write an inverse stops its world.
 */
export const itemOfSlotValue = (value: PlainData, content?: ServerContent): Item | null => {
    if (value === null) return null;
    if (!isStoredItemStack(value)) throw new TypeError(`A logged slot cannot hold ${JSON.stringify(value)}`);
    return restoredItem(value, content);
};
