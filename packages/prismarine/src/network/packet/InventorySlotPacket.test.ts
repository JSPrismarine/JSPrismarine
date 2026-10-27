import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Item } from '../../item/Item';
import { ContainerUiId } from '../type/ItemStackRequest';
import InventorySlotPacket from './InventorySlotPacket';

/**
 * Reads a `NetworkItemStackDescriptor` as the 1.26.51 docs lay it out, without going through
 * `Item`: `Id` int16 LE, `Stack size` uint16 LE, `Aux value` varuint32, a boolean and then a
 * ZigZag `Net Id Variant` when it is set, `Block Runtime Id` varuint32, and the `User Data
 * Buffer` behind a varuint32 length.
 */
const readDescriptor = (stream: BinaryStream) => {
    const id = stream.readShortLE();
    const count = stream.readUnsignedShortLE();
    const aux = stream.readUnsignedVarInt();
    const netId = stream.readBoolean() ? stream.readVarInt() : null;
    const blockRuntimeId = stream.readUnsignedVarInt();
    const userData = stream.read(stream.readUnsignedVarInt());

    return { id, count, aux, netId, blockRuntimeId, userData };
};

/**
 * Reads the packet the way a client of protocol 2193 does, from gophertunnel's
 * `packet/inventory_slot.go` and PocketMine's `InventorySlotPacket`, which agree: Container Id
 * and Slot are both varuint32s, the Full Container Name and the Storage Item are each an
 * optional behind a boolean, and the Item is not.
 */
const readBack = (buffer: Buffer) => {
    const stream = new BinaryStream(buffer);
    expect(stream.readUnsignedVarInt()).toBe(InventorySlotPacket.NetID);

    const containerId = stream.readUnsignedVarInt();
    const slot = stream.readUnsignedVarInt();

    const container = stream.readBoolean()
        ? { name: stream.readByte(), dynamicId: stream.readBoolean() ? stream.readUnsignedIntLE() : null }
        : null;

    const storage = stream.readBoolean() ? readDescriptor(stream) : null;
    const item = readDescriptor(stream);

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

        it('writes an emptied slot as a whole empty stack rather than a bare zero', () => {
            // One byte here ended the packet seven bytes early, which a real client reads as
            // a malformed packet and hangs up on. This fires on every craft.
            const packet = Object.assign(new InventorySlotPacket(), { windowId: 124, inventorySlot: 29 });
            packet.encode();

            const expected = Buffer.from([
                0x32, // Header: packet id 50.
                0x7c, // Container Id: varuint32 124, the player's own UI.
                0x1d, // Slot: varuint32 29.
                0x01, // Full Container Name: present.
                0x0d, // Container Name: CraftingInputContainer (13).
                0x00, // Dynamic ID: absent.
                0x00, // Storage Item: absent.
                0x00,
                0x00, // Item, Id: int16 LE 0.
                0x00,
                0x00, // Stack size: uint16 LE 0.
                0x00, // Aux value: 0.
                0x00, // Net Id Variant: absent.
                0x00, // Block Runtime Id: 0.
                0x00 // User Data Buffer: zero length.
            ]);

            expect([...packet.getBuffer()]).toEqual([...expected]);
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
                item: new Item({ runtimeId: 5, name: 'minecraft:oak_planks', count: 3 })
            });
            packet.encode();

            const item = readBack(packet.getBuffer()).item;
            expect(item.id).toBe(ItemIdMap['minecraft:oak_planks']);
            expect(item.count).toBe(3);
            // A non-empty stack carries the ten-byte empty user data: no NBT, no block lists.
            expect(item.userData).toEqual(Buffer.alloc(10));
        });

        it('writes the stack network id the item has', () => {
            const planks = new Item({ name: 'minecraft:oak_planks', count: 3 });
            planks.stackNetworkId = 21;
            const packet = Object.assign(new InventorySlotPacket(), { windowId: 0, inventorySlot: 4, item: planks });
            packet.encode();

            expect(readBack(packet.getBuffer()).item.netId).toBe(21);
        });

        it('reads back what it writes', () => {
            const planks = new Item({ name: 'minecraft:oak_planks', count: 3 });
            planks.stackNetworkId = 21;

            for (const item of [planks, null]) {
                const packet = Object.assign(new InventorySlotPacket(), {
                    windowId: 7,
                    inventorySlot: 26,
                    containerId: ContainerUiId.LEVEL_ENTITY_CONTAINER,
                    dynamicId: 3,
                    item
                });
                packet.encode();
                const written = packet.getBuffer();

                const decoded = new InventorySlotPacket(written);
                decoded.decode();

                expect(decoded.windowId).toBe(7);
                expect(decoded.inventorySlot).toBe(26);
                expect(decoded.containerId).toBe(ContainerUiId.LEVEL_ENTITY_CONTAINER);
                expect(decoded.dynamicId).toBe(3);
                expect(decoded.item?.getName()).toBe(item?.getName());
                expect(decoded.item?.getAmount()).toBe(item?.getAmount());
                expect(decoded.item?.stackNetworkId).toBe(item?.stackNetworkId);
                expect(decoded.feof()).toBe(true);

                decoded.encode();
                expect([...decoded.getBuffer()]).toEqual([...written]);
            }
        });
    });
});
