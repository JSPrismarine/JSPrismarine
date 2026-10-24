import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import { ContainerUiId } from '../type/ItemStackRequest';
import InventorySlotPacket from './InventorySlotPacket';

/**
 * Reads the packet the way a client of protocol 2193 does, from gophertunnel's
 * `packet/inventory_slot.go` and PocketMine's `InventorySlotPacket`, which agree: Container Id
 * and Slot are both varuint32s, the Full Container Name and the Storage Item are each an
 * optional, and the Item is not.
 */
const readBack = (buffer: Buffer) => {
    const stream = new BinaryStream(buffer);
    expect(stream.readUnsignedVarInt()).toBe(InventorySlotPacket.NetID);

    const containerId = stream.readUnsignedVarInt();
    const slot = stream.readUnsignedVarInt();

    const container = stream.readBoolean()
        ? { name: stream.readByte(), dynamicId: stream.readBoolean() ? stream.readIntLE() : null }
        : null;

    const storage = stream.readBoolean() ? Item.networkDeserialize(stream) : null;
    const item = Item.networkDeserialize(stream);

    expect(stream.feof()).toBe(true);

    return { containerId, slot, container, storage, item };
};

describe('network', () => {
    describe('InventorySlotPacket', () => {
        it('writes the container name as an optional and the storage item as an absent one', () => {
            const packet = Object.assign(new InventorySlotPacket(), {
                windowId: 124,
                inventorySlot: 28,
                containerId: ContainerUiId.CRAFTING_INPUT,
                item: null
            });
            packet.encode();

            const read = readBack(packet.getBuffer());
            expect(read.containerId).toBe(124);
            expect(read.slot).toBe(28);
            expect(read.container).toEqual({ name: ContainerUiId.CRAFTING_INPUT, dynamicId: null });
            expect(read.storage).toBeNull();
        });

        it('writes an emptied slot as a whole air stack rather than a bare zero', () => {
            // One byte here ended the packet seven bytes early, which a real client reads as
            // a malformed packet and hangs up on. This fires on every craft.
            const packet = Object.assign(new InventorySlotPacket(), { windowId: 124, inventorySlot: 29 });
            packet.encode();

            const air = new BinaryStream();
            Item.air().networkSerialize(air);

            const expected = new BinaryStream();
            expected.writeUnsignedVarInt(InventorySlotPacket.NetID);
            expected.writeUnsignedVarInt(124);
            expected.writeUnsignedVarInt(29);
            expected.writeBoolean(true);
            expected.writeByte(ContainerUiId.CRAFTING_INPUT);
            expected.writeBoolean(false);
            expected.writeBoolean(false);
            expected.write(new Uint8Array(air.getBuffer()));

            expect([...packet.getBuffer()]).toEqual([...expected.getBuffer()]);
        });

        it('writes the dynamic id after the container name when there is one', () => {
            const packet = Object.assign(new InventorySlotPacket(), {
                windowId: 3,
                inventorySlot: 0,
                containerId: ContainerUiId.DYNAMIC_CONTAINER,
                dynamicId: 17
            });
            packet.encode();

            expect(readBack(packet.getBuffer()).container).toEqual({
                name: ContainerUiId.DYNAMIC_CONTAINER,
                dynamicId: 17
            });
        });

        it('keeps the item it was given', () => {
            const packet = Object.assign(new InventorySlotPacket(), {
                windowId: 124,
                inventorySlot: 30,
                item: new Item({ id: 5, name: 'minecraft:oak_planks', count: 3 })
            });
            packet.encode();

            expect(readBack(packet.getBuffer()).item?.getAmount()).toBe(3);
        });
    });
});
