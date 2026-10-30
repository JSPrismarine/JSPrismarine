/**
 * The container packets: opening a window, closing it, and what is held in a hand.
 *
 * Layouts follow each packet's docs page at 1.26.51 and are unchanged since protocol 2193.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { itemStackDescriptor } from '../structureTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/**
 * `FullContainerName`: which kind of container, and which one of that kind.
 *
 * Named for the wire fields rather than the structure class of the same name, which the
 * `NetworkStructure` consumers keep.
 */
export interface FullContainerNameData {
    /** `Container Name`: a `ContainerUiId`. */
    containerId: number;
    /** `Dynamic ID`: absent unless several containers of the kind are open at once. */
    dynamicId: number | null;
}

const optionalDynamicId = t.optional(t.li32);

/**
 * `FullContainerName`: the container name byte, then an optional dynamic id.
 *
 * Whether the dynamic id travels is decided by the container, not by the protocol version,
 * so the branch lives in this wire type's reader and writer rather than in a gate. The two
 * inventory packets differ in how they carry this - one behind its own presence byte, one
 * not - which is why it is a named type rather than two inline fields.
 */
export const fullContainerName: WireType<FullContainerNameData> = t.custom(
    'FullContainerName',
    (stream, value) => {
        t.uint8.write(stream, value.containerId);
        optionalDynamicId.write(stream, value.dynamicId);
    },
    (stream) => ({ containerId: t.uint8.read(stream), dynamicId: optionalDynamicId.read(stream) })
);

/** The `ContainerOpenPacket` field list. */
export const containerOpenPacket = definePacket('ContainerOpenPacket', {
    /** `Container Id`: the window the client files this container under. */
    windowId: t.uint8,
    /** `Container Type`: which screen to draw. */
    containerType: t.uint8,
    /** `Position`: zero for a container an actor carries; only a block's has a position. */
    position: t.blockPos,
    /** `Target Actor ID`: the actor whose container this is, or -1 for a block's. */
    containerEntityId: t.varint64
});

/** What `ContainerOpenPacket` carries. */
export type ContainerOpenPayload = PayloadOf<typeof containerOpenPacket>;

/**
 * The `ContainerSetDataPacket` field list.
 *
 * The same `ID` means a different property in each kind of container, so the client reads it
 * against whatever `Container ID` currently has open.
 */
export const containerSetDataPacket = definePacket('ContainerSetDataPacket', {
    /** `Container ID`: the open container the property belongs to. */
    containerId: t.uint8,
    /** `ID`: which property to set. */
    id: t.varint32,
    /** `Value`: the property's new value. */
    value: t.varint32
});

/** What `ContainerSetDataPacket` carries. */
export type ContainerSetDataPayload = PayloadOf<typeof containerSetDataPacket>;

/** The `ContainerClosePacket` field list. */
export const containerClosePacket = definePacket('ContainerClosePacket', {
    /** `Container Id`: the window being closed. */
    containerId: t.uint8,
    /** `Container Type`: which screen it was. */
    containerType: t.uint8,
    /** `Server Initiated Close`: true when the server, not the player, closed it. */
    serverInitiatedClose: t.bool
});

/** What `ContainerClosePacket` carries. */
export type ContainerClosePayload = PayloadOf<typeof containerClosePacket>;

/**
 * The `MobEquipmentPacket` field list.
 *
 * An empty hand is an air stack, not an omission: the descriptor carries its fixed set of
 * fields whatever the id is.
 */
export const mobEquipmentPacket = definePacket('MobEquipmentPacket', {
    /** `Target Runtime ID`. */
    runtimeEntityId: t.varuint64,
    /** `Item`. */
    item: itemStackDescriptor,
    /** `Slot`: where in the inventory the stack sits. */
    inventorySlot: t.uint8,
    /** `Selected Slot`: which hotbar slot is held. */
    hotbarSlot: t.uint8,
    /** `Container ID`: the window the slot is in. */
    windowId: t.uint8
});

/** What `MobEquipmentPacket` carries. */
export type MobEquipmentPayload = PayloadOf<typeof mobEquipmentPacket>;

/**
 * The `InventorySlotPacket` field list.
 *
 * `Container Id` and `Slot` are varuint32s, not the uint8 the docs page types the first as:
 * gophertunnel's `inventory_slot.go` and PocketMine both read a varuint here. `Full Container
 * Name` and `Storage Item` are each an optional; `Item` is not, and an emptied slot travels
 * as a whole empty stack rather than a bare zero.
 */
export const inventorySlotPacket = definePacket('InventorySlotPacket', {
    /** `Container Id`: the window the slot is in; the player's own UI is 124. */
    windowId: t.varuint32,
    /** `Slot`: in the client's numbering. */
    inventorySlot: t.varuint32,
    /** `Full Container Name`: which container of which kind the slot belongs to. */
    fullContainerName: t.optional(fullContainerName),
    /** `Storage Item`: what a bundle-like container is itself held as. */
    storageItem: t.optional(itemStackDescriptor),
    /** `Item`: what is in the slot now. An empty stack empties it. */
    item: itemStackDescriptor
});

/** What `InventorySlotPacket` carries. */
export type InventorySlotPayload = PayloadOf<typeof inventorySlotPacket>;

/**
 * The `InventoryContentPacket` field list.
 *
 * There is no slot index on a slot: position in the list is the slot, so every slot travels,
 * empty or not. Neither `Full Container Name` nor `Storage Item` is an optional here, unlike
 * in `InventorySlotPacket`.
 */
export const inventoryContentPacket = definePacket('InventoryContentPacket', {
    /** `Container Id`: the window these slots belong to. */
    windowId: t.varuint32,
    /** `Slots`: every slot of the container, in order. */
    slots: t.list(itemStackDescriptor),
    /** `Full Container Name`: which container of which kind this is. */
    fullContainerName,
    /** `Storage Item`: what a bundle-like container is itself held as. */
    storageItem: itemStackDescriptor
});

/** What `InventoryContentPacket` carries. */
export type InventoryContentPayload = PayloadOf<typeof inventoryContentPacket>;
