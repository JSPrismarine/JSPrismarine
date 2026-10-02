import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { NetworkUtil } from '../NetworkUtil';
import type { ItemStackRequestSlotInfo } from './ItemStackRequest';
import { ContainerUiId, ItemStackRequestActionType, readItemStackRequest } from './ItemStackRequest';

/**
 * Writers for the client's side of the wire, so a request can be built the way one arrives.
 * They are the mirror of the reader under test, and the reason the tests below are worth
 * anything is that the layout came from the protocol rather than from the reader: protocol
 * 2193's, as gophertunnel's `protocol/item_stack.go` describes it - a stack net id is four
 * fixed bytes, and an action opens with its selector and then its type as a byte.
 */
const writeSlot = (stream: BinaryStream, slot: ItemStackRequestSlotInfo): void => {
    stream.writeByte(slot.container.containerId);
    stream.writeBoolean(slot.container.dynamicId !== null);
    if (slot.container.dynamicId !== null) stream.writeIntLE(slot.container.dynamicId);
    stream.writeByte(slot.slotId);
    stream.writeIntLE(slot.stackNetId);
};

/**
 * The two numbers every action opens with: the selector, which is the action's index among
 * the alternatives and runs two behind the type from the lab table on, and the type itself.
 */
const writeActionType = (stream: BinaryStream, type: ItemStackRequestActionType): void => {
    stream.writeUnsignedVarInt(type >= ItemStackRequestActionType.LAB_TABLE_COMBINE ? type - 2 : type);
    stream.writeByte(type);
};

const slot = (slotId: number, containerId = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY): ItemStackRequestSlotInfo => ({
    container: { containerId, dynamicId: null },
    slotId,
    stackNetId: 0
});

/** One request carrying the given actions, with no filter strings. */
const request = (requestId: number, write: (stream: BinaryStream) => void, actions: number): BinaryStream => {
    const stream = new BinaryStream();
    stream.writeVarInt(requestId);
    stream.writeUnsignedVarInt(actions);
    write(stream);
    stream.writeUnsignedVarInt(0); // Filter strings.
    stream.writeIntLE(0); // Filter string cause.

    return new BinaryStream(stream.getBuffer());
};

describe('network', () => {
    describe('readItemStackRequest', () => {
        it('reads a creative pick: conjure, then place', () => {
            // What taking a block out of the creative menu actually looks like.
            const stream = request(
                7,
                (out) => {
                    writeActionType(out, ItemStackRequestActionType.CREATIVE_CREATE);
                    out.writeUnsignedVarInt(42); // Creative net id.
                    out.writeByte(1); // Repetitions.

                    writeActionType(out, ItemStackRequestActionType.PLACE);
                    out.writeByte(64); // Count.
                    writeSlot(out, slot(0, 99)); // From the menu, not a real container.
                    writeSlot(out, slot(3)); // Into the fourth inventory slot.
                },
                2
            );

            const parsed = readItemStackRequest(stream);

            expect(parsed.requestId).toBe(7);
            expect(parsed.actions).toHaveLength(2);
            expect(parsed.actions[0]!.creativeItemNetId).toBe(42);
            expect(parsed.actions[1]!.type).toBe(ItemStackRequestActionType.PLACE);
            expect(parsed.actions[1]!.count).toBe(64);
            expect(parsed.actions[1]!.destination!.slotId).toBe(3);
            // Nothing left over is what says the layout is right.
            expect(stream.feof()).toBe(true);
        });

        it('reads a swap', () => {
            const stream = request(
                1,
                (out) => {
                    writeActionType(out, ItemStackRequestActionType.SWAP);
                    writeSlot(out, slot(1));
                    writeSlot(out, slot(2));
                },
                1
            );

            const parsed = readItemStackRequest(stream);

            expect(parsed.actions[0]!.source!.slotId).toBe(1);
            expect(parsed.actions[0]!.destination!.slotId).toBe(2);
            expect(stream.feof()).toBe(true);
        });

        it('reads a drop, whose trailing flag is easy to forget', () => {
            const stream = request(
                2,
                (out) => {
                    writeActionType(out, ItemStackRequestActionType.DROP);
                    out.writeByte(5);
                    writeSlot(out, slot(4));
                    out.writeBoolean(true); // Randomly.
                },
                1
            );

            const parsed = readItemStackRequest(stream);

            expect(parsed.actions[0]!.count).toBe(5);
            expect(stream.feof()).toBe(true);
        });

        it('reads an action it does nothing with, so the ones after it still line up', () => {
            // The whole reason every type is decoded: an action cannot be stepped over
            // without reading it, and a mis-read one takes the rest of the packet with it.
            const stream = request(
                3,
                (out) => {
                    writeActionType(out, ItemStackRequestActionType.BEACON_PAYMENT);
                    out.writeVarInt(1);
                    out.writeVarInt(2);

                    writeActionType(out, ItemStackRequestActionType.DESTROY);
                    out.writeByte(1);
                    writeSlot(out, slot(8));
                },
                2
            );

            const parsed = readItemStackRequest(stream);

            expect(parsed.actions[1]!.type).toBe(ItemStackRequestActionType.DESTROY);
            expect(parsed.actions[1]!.source!.slotId).toBe(8);
            expect(stream.feof()).toBe(true);
        });

        it('reads the filter strings a rename carries', () => {
            const stream = new BinaryStream();
            stream.writeVarInt(9);
            stream.writeUnsignedVarInt(0); // No actions.
            stream.writeUnsignedVarInt(1);
            NetworkUtil.writeString(stream, 'a name');
            stream.writeIntLE(3);

            const parsed = readItemStackRequest(new BinaryStream(stream.getBuffer()));

            expect(parsed.filterStrings).toEqual(['a name']);
            expect(parsed.filterStringCause).toBe(3);
        });

        it('reads a stack net id that needs all four bytes', () => {
            const stream = request(
                5,
                (out) => {
                    writeActionType(out, ItemStackRequestActionType.TAKE);
                    out.writeByte(1);
                    writeSlot(out, { ...slot(2), stackNetId: 70000 });
                    writeSlot(out, slot(3));
                },
                1
            );

            const parsed = readItemStackRequest(stream);

            // Read as a varint, 70000 would come out as a small number and a stray byte.
            expect(parsed.actions[0]!.source!.stackNetId).toBe(70000);
            expect(stream.feof()).toBe(true);
        });

        it('reads a mined block, whose net id is four fixed bytes too', () => {
            const stream = request(
                6,
                (out) => {
                    writeActionType(out, ItemStackRequestActionType.MINE_BLOCK);
                    out.writeVarInt(4); // Hotbar slot.
                    out.writeVarInt(250); // Predicted durability.
                    out.writeIntLE(-1); // Stack net id.
                },
                1
            );

            const parsed = readItemStackRequest(stream);

            expect(parsed.actions[0]!.hotbarSlot).toBe(4);
            expect(stream.feof()).toBe(true);
        });

        it('dispatches on the selector, which runs two behind the type past the gap', () => {
            // The lab table is type 9 but selector 7: the two deprecated container actions
            // are not alternatives on the wire. A reader that takes the byte for the type
            // would be right here and wrong about the selector, and vice versa.
            const stream = request(
                8,
                (out) => {
                    out.writeUnsignedVarInt(7);
                    out.writeByte(ItemStackRequestActionType.LAB_TABLE_COMBINE);
                },
                1
            );

            const parsed = readItemStackRequest(stream);

            expect(parsed.actions[0]!.type).toBe(ItemStackRequestActionType.LAB_TABLE_COMBINE);
            expect(stream.feof()).toBe(true);
        });

        it("steps over the ingredients an auto craft carries, in the client's descriptor form", () => {
            const stream = request(
                9,
                (out) => {
                    writeActionType(out, ItemStackRequestActionType.CRAFTING_RECIPE_AUTO);
                    out.writeUnsignedVarInt(12); // Recipe net id.
                    out.writeByte(2); // Repetitions.
                    out.writeUnsignedVarInt(2); // Ingredients.
                    // A named item: selector, the same as a byte, name, aux, count.
                    out.writeUnsignedVarInt(1);
                    out.writeByte(1);
                    NetworkUtil.writeString(out, 'minecraft:oak_planks');
                    out.writeVarInt(32767);
                    out.writeUnsignedShortLE(4);
                    // A tag.
                    out.writeUnsignedVarInt(3);
                    out.writeByte(3);
                    NetworkUtil.writeString(out, 'minecraft:planks');
                    out.writeUnsignedShortLE(1);
                },
                1
            );

            const parsed = readItemStackRequest(stream);

            expect(parsed.actions[0]!.repetitions).toBe(2);
            expect(stream.feof()).toBe(true);
        });

        it('refuses an action type it does not know, rather than reading on regardless', () => {
            const stream = request(4, (out) => out.writeUnsignedVarInt(200), 1);

            expect(() => readItemStackRequest(stream)).toThrow(/202/);
        });
    });
});
