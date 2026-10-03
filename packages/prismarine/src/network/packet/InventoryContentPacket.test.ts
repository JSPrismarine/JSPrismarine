import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { ContainerUiId } from '../type/ItemStackRequest';
import InventoryContentPacket from './InventoryContentPacket';

/**
 * What the client is told it is carrying.
 *
 * Never sent, until now: the call was commented out, and it would have thrown on its first
 * empty slot if it had not been. Under the server authoritative inventory system a client
 * that has not been told what a container holds will not move anything into it, which is what
 * left an item refusing to come off its slot.
 * @see https://github.com/pmmp/BedrockProtocol/blob/35.0.0%2Bbedrock-1.21.40/src/InventoryContentPacket.php
 */
const encoded = (inventory: HumanInventory): Buffer => {
    const packet = new InventoryContentPacket();
    packet.items = inventory.getItems(true);
    packet.windowId = 0;
    packet.encode();

    return packet.getBuffer();
};

describe('InventoryContentPacket', () => {
    const filled = (): HumanInventory => {
        const inventory = new HumanInventory();
        inventory.setItem(
            0,
            new ContainerEntry({ item: new Item({ id: 0, name: 'minecraft:oak_planks', count: 12 }) })
        );
        inventory.setItem(5, new ContainerEntry({ item: new Item({ id: 0, name: 'minecraft:diamond_sword' }) }));

        return inventory;
    };

    it('writes every slot, empty ones included', () => {
        // Position is the slot, so a container short of a slot is a container whose every
        // later item is in the wrong place.
        const stream = new BinaryStream(encoded(filled()));
        stream.readUnsignedVarInt(); // Packet header.
        stream.readUnsignedVarInt(); // Window id.

        expect(stream.readUnsignedVarInt()).toBe(36);
    });

    it('reads back to the last byte, with the container name and storage stack after it', () => {
        const stream = new BinaryStream(encoded(filled()));
        stream.readUnsignedVarInt();

        expect(stream.readUnsignedVarInt()).toBe(0);

        const ids: number[] = [];
        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            ids.push(Item.networkDeserialize(stream).getId());
        }

        expect(stream.readByte()).toBe(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY);
        expect(stream.readBoolean()).toBe(false);

        // The storage stack, which is air - and air is a whole stack at this version, not the
        // bare zero it used to be.
        expect(Item.networkDeserialize(stream).getId()).toBe(0);
        expect(stream.feof()).toBe(true);

        // An empty slot is a zero, not air's own id: air is -158 in the item table, and
        // writing that leaves a real item in every slot the player is not using.
        expect(ids.filter((id) => id !== 0)).toHaveLength(2);
        expect(ids[0]).not.toBe(0);
        expect(ids[5]).not.toBe(0);
    });

    it('does not throw on an inventory that is entirely empty', () => {
        // Every slot holds an `Air` block rather than an item, and a block cannot be written
        // out as a stack. This threw on slot zero, every time.
        expect(() => encoded(new HumanInventory())).not.toThrow();
    });
});
