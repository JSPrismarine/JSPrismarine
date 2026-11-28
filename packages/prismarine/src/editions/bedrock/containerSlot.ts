import InventorySlotPacket from '@jsprismarine/protocol/bedrock/packet/InventorySlotPacket';

import type { Item } from '../../item/Item';
import type ClientConnection from '../../network/ClientConnection';

/**
 * Tells a Bedrock client that one slot of a container it has open now holds something else.
 *
 * An `ItemStackResponse` only ever reaches the client that sent the request, so this is the only
 * way to tell the other players standing at the same chest that a stack has gone.
 *
 * @param connection - The client's connection.
 * @param windowId - The `Container Id` the client opened the block under, which is its own.
 * @param containerId - The `Container Name` the client numbers the slot by.
 * @param slot - The slot within that container.
 * @param item - What is in it now, or `null` to empty it.
 */
export const sendContainerSlot = async (
    connection: Pick<ClientConnection, 'codec' | 'sendDataPacket'>,
    windowId: number,
    containerId: number,
    slot: number,
    item: Item | null
): Promise<void> => {
    const packet = new InventorySlotPacket();
    packet.windowId = windowId;
    packet.containerId = containerId;
    packet.inventorySlot = slot;
    packet.item =
        item?.toStackDescriptor(connection.codec.context, item.stackNetworkId > 0 ? item.stackNetworkId : null) ?? null;
    await connection.sendDataPacket(packet);
};
