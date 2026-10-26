import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { ItemInstanceUserData, NetworkBinaryStream, NetworkItemStackDescriptor } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { Item } from './Item';

/**
 * `Item` reads an item stack by hand while `@jsprismarine/protocol` already describes the
 * same bytes, from the published protocol docs. Checking one against the other is the closest
 * thing to a real client this can get, and it is the disagreement between them that broke
 * survival block breaking: `Item` skipped the flag saying whether a stack net id follows, so
 * every field after it was one byte out, the can-place-on list it then walked had a nonsense
 * length, and the read ran off the end of the buffer. The InventoryTransaction carrying the
 * break never survived decoding, and the block broke in silence.
 */
const descriptorBytes = (descriptor: NetworkItemStackDescriptor): Buffer => {
    const stream = new NetworkBinaryStream();
    descriptor.serialize(stream);
    return stream.getBuffer();
};

describe('item', () => {
    describe('Item.networkDeserialize', () => {
        it('reads what the protocol package writes, to the last byte', () => {
            const written = descriptorBytes(new NetworkItemStackDescriptor(5, 64, 3, false, 1234));

            const stream = new NetworkBinaryStream(written);
            const item = Item.networkDeserialize(stream);

            expect(item.getNetworkId()).toBe(5);
            expect(item.meta).toBe(3);
            // Nothing left over is the whole point: a reader one byte out still returns an
            // item, it just leaves the stream in the wrong place for whatever reads next.
            expect(stream.feof()).toBe(true);
        });

        it('reads a stack that carries a net id', () => {
            const written = descriptorBytes(new NetworkItemStackDescriptor(7, 1, 0, true, 99, { netIdVariant: 42 }));

            const stream = new NetworkBinaryStream(written);
            const item = Item.networkDeserialize(stream);

            expect(item.getNetworkId()).toBe(7);
            expect(stream.feof()).toBe(true);
        });

        /**
         * Air is a whole stack now, not a bare zero. Up to 748 a zero id ended the structure;
         * at 2168 the count, the aux value, the flag, the runtime id and an empty user data
         * length are all still written, so a reader that stops at the id leaves seven bytes
         * for whatever reads next.
         */
        it('reads air to the end of the stack, and leaves the rest of the stream alone', () => {
            const stream = new NetworkBinaryStream();
            new NetworkItemStackDescriptor(0, 0, 0, false, 0).serialize(stream);
            stream.writeVarInt(1234); // whatever the packet reads next

            const read = new NetworkBinaryStream(stream.getBuffer());
            const item = Item.networkDeserialize(read);

            expect(item.getName()).toBe('minecraft:air');
            expect(read.readVarInt()).toBe(1234);
        });
    });

    describe('Item.networkSerialize', () => {
        const serialized = (item: Item, stackNetId: number | null = null): Buffer => {
            const stream = new NetworkBinaryStream();
            item.networkSerialize(stream, stackNetId);
            return stream.getBuffer();
        };

        /** The empty `ItemInstanceUserData` a stack without NBT or block lists carries. */
        const emptyUserData = (): Buffer => {
            const stream = new NetworkBinaryStream();
            new ItemInstanceUserData(null).serialize(stream);
            return stream.getBuffer();
        };

        /**
         * The `ItemInstanceUserData` of an unused item that has durability: a compound holding
         * only `Damage` 0, which a Bedrock Dedicated Server 1.26.52 sends for every such item.
         */
        const unusedUserData = (shield = false): Buffer => {
            const tag = new NBTTagCompound('');
            tag.addValue('Damage', new Types.NumberVal(0));
            const stream = new NetworkBinaryStream();
            new ItemInstanceUserData(tag, shield ? { blockingTick: 0n } : {}).serialize(stream);
            return stream.getBuffer();
        };

        it('writes the same bytes the protocol package would, user data included', () => {
            const item = new Item({ id: 1, name: 'minecraft:stone', meta: 0 });
            const blockRuntimeId = BlockRuntimeIds.getByName('minecraft:stone');
            const descriptor = new NetworkItemStackDescriptor(item.getNetworkId(), 1, 0, false, blockRuntimeId, {
                userDataBuffer: emptyUserData()
            });

            // The flag between the aux value and the runtime id used to be left to a closure
            // no caller passed, so every item the server sent was a byte short of this.
            expect(serialized(item)).toEqual(descriptorBytes(descriptor));
        });

        it('ends a shield with its blocking tick', () => {
            const shield = new Item({ id: 355, name: 'minecraft:shield', meta: 0 });
            const descriptor = new NetworkItemStackDescriptor(shield.getNetworkId(), 1, 0, false, 0, {
                userDataBuffer: unusedUserData(true)
            });

            expect(serialized(shield)).toEqual(descriptorBytes(descriptor));
        });

        it('writes the stack net id when there is one', () => {
            const item = new Item({ id: 1, name: 'minecraft:stone', meta: 0 });

            const withNetId = serialized(item, 42);
            const without = serialized(item);

            expect(withNetId).not.toEqual(without);
            expect(Item.networkDeserialize(new NetworkBinaryStream(withNetId)).getNetworkId()).toBe(
                item.getNetworkId()
            );
        });

        it('gives an item that places no block a runtime id of zero, instead of throwing', () => {
            // `BlockRuntimeIds.getByName` has no answer for a sword, and raised - taking the
            // whole packet, and so the entire inventory, down with it.
            const sword = new Item({ id: 308, name: 'minecraft:diamond_sword', meta: 0 });
            const descriptor = new NetworkItemStackDescriptor(sword.getNetworkId(), 1, 0, false, 0, {
                userDataBuffer: unusedUserData()
            });

            expect(() => serialized(sword)).not.toThrow();
            expect(serialized(sword)).toEqual(descriptorBytes(descriptor));
        });

        it('writes a body for an item whose numeric id is zero but whose name resolves', () => {
            // Every recipe output is built this way: no numeric id, a name the item table
            // knows. Deciding on `getId()` rather than on the id actually written made these
            // two bytes long - a real item with nothing after it - and the client that read
            // one left without a word.
            const output = new Item({ id: 0, name: 'minecraft:stick' });

            expect(output.getNetworkId()).not.toBe(0);

            const stream = new NetworkBinaryStream(serialized(output));
            const read = Item.networkDeserialize(stream);

            expect(read.getNetworkId()).toBe(output.getNetworkId());
            expect(stream.feof()).toBe(true);
        });

        it('writes air as a zeroed stack, whatever the item table calls it', () => {
            // The item table has an id for air - it is -158 - and taking it leaves the client
            // holding a real item in every slot the player is not using. Most of an inventory
            // is empty slots, so most of the packet was that.
            const air = new Item({ id: 0, name: 'minecraft:air' });

            expect(ItemIdMap['minecraft:air']).not.toBe(0);

            // The whole stack, all of it zero: two id bytes, two count bytes, the aux value,
            // the flag, the runtime id and an empty user data length.
            expect(serialized(air)).toEqual(Buffer.alloc(8));

            const stream = new NetworkBinaryStream();
            air.networkSerialize(stream);
            stream.writeVarInt(1234); // Whatever the packet writes next.

            const read = new NetworkBinaryStream(stream.getBuffer());
            expect(Item.networkDeserialize(read).getName()).toBe('minecraft:air');
            expect(read.readVarInt()).toBe(1234);
        });

        it('writes a zeroed stack for something that resolves to nothing', () => {
            const nowhere = new Item({ id: 0, name: 'minecraft:not_a_real_item' });

            expect(nowhere.getNetworkId()).toBeFalsy();
            expect(serialized(nowhere)).toEqual(Buffer.alloc(8));
        });

        it('round-trips through networkDeserialize', () => {
            const item = new Item({ id: 5, name: 'minecraft:stone', meta: 3 });

            const stream = new NetworkBinaryStream(serialized(item));
            const read = Item.networkDeserialize(stream);

            expect(read.getNetworkId()).toBe(item.getNetworkId());
            expect(read.meta).toBe(3);
            expect(read.getAmount()).toBe(1);
            expect(stream.feof()).toBe(true);
        });
    });

    /**
     * There are two forms of an item stack on the wire. An actor, an inventory or a
     * transaction carries the one that can be tracked - it has a flag saying whether a stack
     * net id follows - and the creative menu and every recipe carry the one that cannot.
     *
     * Up to 748 they differed by that flag and nothing else. At 2168 they also disagree about
     * how the id and the block runtime id are written: the tracked form spends two fixed bytes
     * on the id and writes the runtime id unsigned, while the other uses a varint for both. So
     * the two are no longer a prefix of one another anywhere past the id, and a stack written
     * in the wrong form is not one byte out, it is wrong from the first byte.
     *
     * Confusing them is what got a packet rejected with `PacketViolationWarning` for 0x91,
     * "String length value 3843437932" - a block runtime id, read as the length of a string.
     */
    describe('the two stack forms', () => {
        const write = (item: Item, withStackId: boolean): Buffer => {
            const stream = new NetworkBinaryStream();
            if (withStackId) item.networkSerialize(stream);
            else item.networkSerializeWithoutStackId(stream);

            return stream.getBuffer();
        };

        it('write the id differently, so neither starts with the other', () => {
            const item = new Item({ id: 1, name: 'minecraft:stone', meta: 0 });

            const tracked = write(item, true);
            const untracked = write(item, false);

            // Two fixed little endian bytes against a zigzag varint, which for an id this
            // small is one byte holding twice the id.
            expect(tracked.subarray(0, 2)).toEqual(Buffer.from([item.getNetworkId(), 0]));
            expect(untracked[0]).toBe(item.getNetworkId() * 2);
        });

        it('agree on the count and the aux value that follow the id', () => {
            const item = new Item({ id: 1, name: 'minecraft:stone', meta: 7 });
            // The two count bytes and the meta varint, after each form's own id.
            const body = 3;

            expect(write(item, true).subarray(2, 2 + body)).toEqual(write(item, false).subarray(1, 1 + body));
        });

        it('each reads back what it wrote, to the last byte', () => {
            const item = new Item({ id: 1, name: 'minecraft:stone', meta: 7 });

            const tracked = new NetworkBinaryStream(write(item, true));
            expect(Item.networkDeserialize(tracked).meta).toBe(7);
            expect(tracked.feof()).toBe(true);

            const untracked = new NetworkBinaryStream(write(item, false));
            expect(Item.networkDeserializeWithoutStackId(untracked).meta).toBe(7);
            expect(untracked.feof()).toBe(true);
        });

        it('cannot be read by the other reader without ending up misaligned', () => {
            // The failure the client reported, reproduced: read the untracked form as though
            // it were tracked and the runtime id is taken for the flag.
            const item = new Item({ id: 1, name: 'minecraft:stone', meta: 0 });

            const stream = new NetworkBinaryStream(write(item, false));
            Item.networkDeserialize(stream);

            expect(stream.feof()).toBe(false);
        });
    });

    describe('Item.getBlockRuntimeId', () => {
        /** The `Block Runtime Id` field of the untracked form, read past the id, count and aux value. */
        const writtenBlockId = (item: Item): number => {
            const written = new NetworkBinaryStream();
            item.networkSerializeWithoutStackId(written);

            const stream = new NetworkBinaryStream(written.getBuffer());
            stream.readVarInt();
            stream.readUnsignedShortLE();
            stream.readUnsignedVarInt();
            return stream.readVarInt();
        };

        it('resolves a block by name to its default state', () => {
            const stone = new Item({ id: 1, name: 'minecraft:stone' });

            expect(stone.getBlockRuntimeId()).toBe(BlockRuntimeIds.getByName('minecraft:stone'));
            expect(writtenBlockId(stone)).toBe(stone.getBlockRuntimeId());
        });

        it('writes the id it was given instead of the one the name resolves to', () => {
            const piston = new Item({ id: 33, name: 'minecraft:piston', blockRuntimeId: 1234 });

            expect(piston.getBlockRuntimeId()).toBe(1234);
            expect(writtenBlockId(piston)).toBe(1234);
        });

        it('keeps an explicit zero for a block-shaped item that places no block', () => {
            // A door is a block to this server and an item to vanilla, which sends a zero here.
            const door = new Item({ id: 324, name: 'minecraft:wooden_door', blockRuntimeId: 0 });

            expect(BlockRuntimeIds.tryGetByName('minecraft:wooden_door')).not.toBeNull();
            expect(writtenBlockId(door)).toBe(0);
        });
    });
});
