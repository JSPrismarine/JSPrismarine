import BinaryStream from '@jsprismarine/binaryutils';
import { item_table as ItemTable } from '@jsprismarine/bedrock-data';
import type { ProtocolContext } from '@jsprismarine/protocol';
import { ItemInstanceUserData, NetworkBinaryStream } from '@jsprismarine/protocol';
import { netIdFor } from '@jsprismarine/protocol/wire/versions/v2193';
import { ContainerUiId } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import Inventory from '../../inventory/Inventory';
import { Item } from '../../item/Item';
import InventoryContentPacket from '@jsprismarine/protocol/packet/InventoryContentPacket';

const protocolContext: ProtocolContext = { protocolVersion: 2193 };

const descriptors = (items: ContainerEntry[]) =>
    items.map((entry) => {
        const item = entry.toItemStack();
        return item.toStackDescriptor(protocolContext, item.stackNetworkId > 0 ? item.stackNetworkId : null);
    });

/**
 * Reads a `NetworkItemStackDescriptor` as the 1.26.51 docs lay it out, without going through
 * `Item`, so that a slip in the encoder cannot be hidden by the same slip in the decoder.
 *
 * `Id` is an int16 (little endian), `Stack size` a uint16, `Aux value` a varuint32, then a
 * boolean saying whether a ZigZag `Net Id Variant` follows, `Block Runtime Id` as a varuint32,
 * and `User Data Buffer` as a varuint32 length and that many bytes. Every field is written
 * for an empty stack too; only the blob shrinks to a zero length.
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
 * Reads the `ItemInstanceUserData` blob of a non-empty stack with no NBT: an int16 marker of
 * `0`, then the can-place-on and can-destroy lists, each an int32 count of strings.
 */
const readUserData = (blob: Buffer) => {
    const stream = new BinaryStream(blob);
    const marker = stream.readShortLE();
    const readList = (): string[] => {
        const names: string[] = [];
        for (let i = 0, count = stream.readIntLE(); i < count; i++) {
            names.push(stream.read(stream.readShortLE()).toString('utf-8'));
        }
        return names;
    };
    const canPlaceOn = readList();
    const canDestroy = readList();

    expect(stream.feof()).toBe(true);
    return { marker, canPlaceOn, canDestroy };
};

/** Reads the whole packet in docs order and insists on reaching the last byte. */
const readBack = (buffer: Buffer) => {
    const stream = new BinaryStream(buffer);
    expect(stream.readUnsignedVarInt()).toBe(netIdFor('InventoryContentPacket'));

    const containerId = stream.readUnsignedVarInt();
    const slots: ReturnType<typeof readDescriptor>[] = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        slots.push(readDescriptor(stream));
    }
    const containerName = stream.readByte();
    const dynamicId = stream.readBoolean() ? stream.readUnsignedIntLE() : null;
    const storageItem = readDescriptor(stream);

    expect(stream.feof()).toBe(true);
    return { containerId, slots, containerName, dynamicId, storageItem };
};

const encoded = (items: ContainerEntry[], windowId = 0): Buffer => {
    const packet = new InventoryContentPacket();
    packet.items = descriptors(items);
    packet.windowId = windowId;
    packet.encode();

    return packet.getBuffer();
};

describe('InventoryContentPacket', () => {
    /** A player's inventory as `PlayerSession.sendInventory` sends it on join. */
    const filled = (): HumanInventory => {
        const inventory = new HumanInventory();
        inventory.setItem(
            0,
            new ContainerEntry({ item: new Item({ runtimeId: 0, name: 'minecraft:oak_planks', count: 12 }) })
        );
        inventory.setItem(5, new ContainerEntry({ item: new Item({ runtimeId: 0, name: 'minecraft:diamond_sword' }) }));

        return inventory;
    };

    it('decodes the join-time inventory in docs order to the last byte', () => {
        const read = readBack(encoded(filled().getItems(true)));

        expect(read.containerId).toBe(0);
        // Position is the slot, so every one of the 36 is written, empty or not.
        expect(read.slots).toHaveLength(36);
        expect(read.containerName).toBe(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY);
        expect(read.dynamicId).toBeNull();

        const planks = read.slots[0]!;
        expect(planks.id).toBe(ItemTable['minecraft:oak_planks']!.runtime_id);
        expect(planks.count).toBe(12);
        expect(planks.netId).toBeNull();
        expect(planks.blockRuntimeId).not.toBe(0);
        expect(readUserData(planks.userData)).toEqual({ marker: 0, canPlaceOn: [], canDestroy: [] });

        const sword = read.slots[5]!;
        expect(sword.id).toBe(ItemTable['minecraft:diamond_sword']!.runtime_id);
        expect(sword.count).toBe(1);
        expect(sword.blockRuntimeId).toBe(0);

        // An empty slot is a zero id, not air's own id (-158 in the item table), and the
        // blob behind it has no length at all.
        const empty = read.slots[1]!;
        expect(empty).toEqual({ id: 0, count: 0, aux: 0, netId: null, blockRuntimeId: 0, userData: Buffer.alloc(0) });

        // The storage item is written in full as an empty stack. Nothing here is a bundle.
        expect(read.storageItem.id).toBe(0);
        expect(read.storageItem.userData).toHaveLength(0);
    });

    it('matches a hand-written buffer', () => {
        const inventory = new Inventory(2);
        inventory.setItem(0, new ContainerEntry({ item: new Item({ runtimeId: 0, name: 'minecraft:diamond_sword' }) }));
        const swordId = ItemTable['minecraft:diamond_sword']!.runtime_id;

        const empty = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        const expected = Buffer.from([
            0x31, // Header: packet id 49.
            0x00, // Container Id: varuint32 0, the player inventory.
            0x02, // Slots: count 2.
            swordId & 0xff,
            swordId >> 8, // Id: int16 LE.
            0x01,
            0x00, // Stack size: uint16 LE 1.
            0x00, // Aux value: varuint32 0.
            0x00, // Net Id Variant: absent.
            0x00, // Block Runtime Id: varuint32 0, a sword places nothing.
            0x1c, // User Data Buffer: 28 bytes follow.
            0xff,
            0xff, // NBT marker: int16 LE -1, a compound follows.
            0x01, // User data version.
            0x0a,
            0x00,
            0x00, // An unnamed compound.
            0x03,
            0x06,
            0x00,
            ...Buffer.from('Damage'),
            0x00,
            0x00,
            0x00,
            0x00, // An int named Damage, 0. A sword wears, and BDS 1.26.52 sends Damage 0 unused.
            0x00, // End of the compound.
            0x00,
            0x00,
            0x00,
            0x00, // Can place on: int32 LE count 0.
            0x00,
            0x00,
            0x00,
            0x00, // Can destroy: int32 LE count 0.
            ...empty, // Slot 1: an empty stack, every field zero and a zero-length blob.
            0x0c, // Full Container Name: CombinedHotbarAndInventoryContainer (12).
            0x00, // Dynamic ID: absent.
            ...empty // Storage Item: an empty stack.
        ]);

        expect([...encoded(inventory.getItems(true))]).toEqual([...expected]);
    });

    it('writes the dynamic id as a uint32 after its presence byte', () => {
        const packet = new InventoryContentPacket();
        packet.windowId = 3;
        packet.containerId = ContainerUiId.DYNAMIC_CONTAINER;
        packet.dynamicId = 0x01020304;
        packet.encode();

        const read = readBack(packet.getBuffer());
        expect(read.containerId).toBe(3);
        expect(read.containerName).toBe(ContainerUiId.DYNAMIC_CONTAINER);
        expect(read.dynamicId).toBe(0x01020304);
    });

    it('writes the stack network id a stack has, and none for a stack without one', () => {
        const inventory = new Inventory(3);
        const planks = new Item({ name: 'minecraft:oak_planks', count: 12 });
        planks.stackNetworkId = 7;
        inventory.setItem(0, new ContainerEntry({ item: planks, count: 12 }));
        inventory.setItem(1, new ContainerEntry({ item: new Item({ name: 'minecraft:stone' }) }));

        // A ZigZag varint after the presence byte; slot 2 is empty and has none.
        expect(readBack(encoded(inventory.getItems(true))).slots.map((slot) => slot.netId)).toEqual([7, null, null]);
    });

    it('reads back what it writes', () => {
        const planks = new Item({ name: 'minecraft:oak_planks', count: 12 });
        planks.stackNetworkId = 7;
        const helmet = new Item({ name: 'minecraft:iron_helmet' });
        const inventory = new Inventory(3);
        inventory.setItem(0, new ContainerEntry({ item: planks, count: 12 }));
        inventory.setItem(2, new ContainerEntry({ item: helmet, count: 1 }));

        const packet = new InventoryContentPacket();
        packet.windowId = 120;
        packet.containerId = ContainerUiId.ARMOR_CONTAINER;
        packet.dynamicId = 9;
        packet.items = descriptors(inventory.getItems(true));
        packet.encode();
        const written = packet.getBuffer();

        const decoded = new InventoryContentPacket(written);
        decoded.decode();

        expect(decoded.windowId).toBe(120);
        expect(decoded.containerId).toBe(ContainerUiId.ARMOR_CONTAINER);
        expect(decoded.dynamicId).toBe(9);
        expect(
            decoded.items.map((descriptor) => {
                const item = Item.fromStackDescriptor(protocolContext, descriptor);
                return {
                    name: item.getName(),
                    count: item.getAmount(),
                    stackNetworkId: item.stackNetworkId
                };
            })
        ).toEqual([
            { name: 'minecraft:oak_planks', count: 12, stackNetworkId: 7 },
            { name: 'minecraft:air', count: 0, stackNetworkId: 0 },
            { name: 'minecraft:iron_helmet', count: 1, stackNetworkId: 0 }
        ]);
        expect(decoded.feof()).toBe(true);

        decoded.encode();
        expect([...decoded.getBuffer()]).toEqual([...written]);
    });

    it('writes a shield with its blocking tick at the end of the blob', () => {
        const inventory = new Inventory(1);
        inventory.setItem(0, new ContainerEntry({ item: new Item({ runtimeId: 0, name: 'minecraft:shield' }) }));

        const shield = readBack(encoded(inventory.getItems(true))).slots[0]!;
        // A shield wears, so its blob holds the 28 bytes of a `Damage` 0 compound and two
        // empty lists, and then the eight-byte tick.
        expect(shield.userData).toHaveLength(36);
        const blob = new NetworkBinaryStream(shield.userData);
        const userData = new ItemInstanceUserData();
        userData.deserialize(blob, true);

        expect(blob.feof()).toBe(true);
        expect(userData.userDataTag?.getNumber('Damage', -1)).toBe(0);
        expect(userData.blockingTick).toBe(0n);
    });

    it('carries an enchanted, renamed stack without losing the rest of the packet', () => {
        // The blob is length prefixed, so NBT inside it is the one thing that can push every
        // field after it out of place. A client that reads this packet one field short
        // disconnects rather than drawing the item wrong, which is why the whole packet is
        // read back rather than just the stack.
        const inventory = new Inventory(1);
        const sword = new Item({ runtimeId: 0, name: 'minecraft:diamond_sword' })
            .withEnchantments({ 'minecraft:sharpness': 2 })
            .withDisplay('Needle', ['Out of a dungeon']);
        inventory.setItem(0, new ContainerEntry({ item: sword }));

        const slot = readBack(encoded(inventory.getItems(true))).slots[0]!;
        const blob = new NetworkBinaryStream(slot.userData);
        const userData = new ItemInstanceUserData();
        userData.deserialize(blob);

        expect(blob.feof()).toBe(true);
        expect(userData.userDataTag?.getCompound('display', false)?.getString('Name', '')).toBe('Needle');
        expect(userData.userDataTag?.getList('ench', false)?.size).toBe(1);
    });

    it('does not throw on an inventory that is entirely empty', () => {
        // Every slot holds an `Air` block rather than an item, and a block cannot be written
        // out as a stack. This threw on slot zero, every time.
        expect(() => encoded(new HumanInventory().getItems(true))).not.toThrow();
    });
});
