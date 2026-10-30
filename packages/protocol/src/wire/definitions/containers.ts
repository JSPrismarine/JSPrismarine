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
