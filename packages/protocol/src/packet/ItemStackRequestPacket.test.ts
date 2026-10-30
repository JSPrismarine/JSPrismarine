import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { ContainerUiId, ItemStackRequestActionType } from '../wire/structures/ItemStackRequest';
import ItemStackRequestPacket from './ItemStackRequestPacket';

/**
 * The packet as a client writes it, built from the layout rather than from the reader.
 *
 * Protocol 2193's, from Mojang's docs and gophertunnel's `protocol/item_stack.go`: the
 * header, a varuint request count, then each request as Client Request Id, Actions,
 * Strings To Filter and StringsToFilterOrigin. Every byte is written by hand so the test
 * knows the layout instead of trusting the reader to agree with itself.
 */
const oneTake = (): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(0x93); // Header: 147.
    out.writeUnsignedVarInt(1); // Requests.
    out.writeVarInt(-3); // Client Request Id, negative like the client sends.
    out.writeUnsignedVarInt(1); // Actions.
    out.writeUnsignedVarInt(0); // Variant index: take.
    out.writeByte(ItemStackRequestActionType.TAKE); // Action type.
    out.writeByte(12); // Amount.
    out.writeByte(ContainerUiId.CURSOR); // Source: Container Name.
    out.writeBoolean(false); // Source: no Dynamic ID.
    out.writeByte(0); // Source: Slot.
    out.writeIntLE(70000); // Source: Net Id Variant, four fixed bytes.
    out.writeByte(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY); // Destination: Container Name.
    out.writeBoolean(false); // Destination: no Dynamic ID.
    out.writeByte(5); // Destination: Slot.
    out.writeIntLE(0); // Destination: Net Id Variant.
    out.writeUnsignedVarInt(0); // Strings To Filter.
    out.writeIntLE(0); // StringsToFilterOrigin.

    return out.getBuffer();
};

const decode = (buffer: Buffer): ItemStackRequestPacket => {
    const packet = new ItemStackRequestPacket(buffer);
    packet.decode();
    return packet;
};

describe('ItemStackRequestPacket', () => {
    it('reads one take request laid out as 2193 specifies and consumes every byte', () => {
        const packet = decode(oneTake());

        expect(packet.requests).toHaveLength(1);
        const request = packet.requests[0]!;
        expect(request.requestId).toBe(-3);
        expect(request.actions).toHaveLength(1);
        expect(request.actions[0]!.type).toBe(ItemStackRequestActionType.TAKE);
        expect(request.actions[0]!.count).toBe(12);
        expect(request.actions[0]!.source).toEqual({
            container: { containerId: ContainerUiId.CURSOR, dynamicId: null },
            slotId: 0,
            stackNetId: 70000
        });
        expect(request.actions[0]!.destination).toEqual({
            container: { containerId: ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, dynamicId: null },
            slotId: 5,
            stackNetId: 0
        });
        expect(request.filterStrings).toEqual([]);
        expect(request.filterStringCause).toBe(0);
        // Nothing left over is what says the layout is right.
        expect(packet.feof()).toBe(true);
    });

    it('reads a creative pick from bytes written by hand', () => {
        // A `CraftCreative` and the `Place` that puts the result on the cursor, as 2193 lays
        // them out. 147 does not fit one varuint byte, so the header is two.
        const packet = decode(
            Buffer.from([
                0x93, // Header: 147.
                0x01,
                0x01, // Requests: one.
                0x01, // Client Request Id: -1 as a ZigZag varint32.
                0x02, // Actions: two.
                0x0c, // Variant index: CraftCreative is type 14, index 12 past the gap.
                0x0e, // Action type: CraftCreative.
                0xac, // Creative Item Net Id: 300.
                0x02,
                0x01, // Number of requested crafts.
                0x01, // Variant index: Place.
                0x01, // Action type: Place.
                0x40, // Amount: 64.
                0x3c, // Source: Container Name, CreatedOutputContainer.
                0x00, // Source: no Dynamic ID.
                0x32, // Source: Slot 50, the created item output slot.
                0x00, // Source: Net Id Variant, four fixed bytes.
                0x00,
                0x00,
                0x00,
                0x3b, // Destination: Container Name, CursorContainer.
                0x00, // Destination: no Dynamic ID.
                0x00, // Destination: Slot.
                0x00, // Destination: Net Id Variant.
                0x00,
                0x00,
                0x00,
                0x00, // Strings To Filter: none.
                0x00, // StringsToFilterOrigin: unknown, as an int32 LE.
                0x00,
                0x00,
                0x00
            ])
        );

        expect(packet.requests).toEqual([
            {
                requestId: -1,
                actions: [
                    { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 300, repetitions: 1 },
                    {
                        type: ItemStackRequestActionType.PLACE,
                        count: 64,
                        source: {
                            container: { containerId: ContainerUiId.CREATED_OUTPUT, dynamicId: null },
                            slotId: 50,
                            stackNetId: 0
                        },
                        destination: {
                            container: { containerId: ContainerUiId.CURSOR, dynamicId: null },
                            slotId: 0,
                            stackNetId: 0
                        }
                    }
                ],
                filterStrings: [],
                filterStringCause: 0
            }
        ]);
        expect(packet.feof()).toBe(true);
    });

    it('refuses a request count no client sends, rather than allocating for it', () => {
        const out = new BinaryStream();
        out.writeUnsignedVarInt(0x93); // Header: 147.
        out.writeUnsignedVarInt(5000);

        expect(() => decode(out.getBuffer())).toThrow(/5000/);
    });

    it('round-trips the retained fields of a mixed batch of actions', () => {
        const packet = new ItemStackRequestPacket();
        packet.requests = [
            {
                requestId: -5,
                actions: [
                    {
                        type: ItemStackRequestActionType.TAKE,
                        count: 3,
                        source: {
                            container: { containerId: ContainerUiId.HOTBAR, dynamicId: 2 },
                            slotId: 1,
                            stackNetId: 42
                        },
                        destination: {
                            container: { containerId: ContainerUiId.CURSOR, dynamicId: null },
                            slotId: 0,
                            stackNetId: -5
                        }
                    },
                    { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 7, repetitions: 2 },
                    { type: ItemStackRequestActionType.MINE_BLOCK, hotbarSlot: 4 },
                    { type: ItemStackRequestActionType.LAB_TABLE_COMBINE },
                    { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 99, repetitions: 1 }
                ],
                filterStrings: ['Anvil Name'],
                filterStringCause: 14
            }
        ];
        packet.encode();

        const decoded = new ItemStackRequestPacket(packet.getBuffer());
        decoded.decode();

        expect(decoded.requests).toHaveLength(1);
        const request = decoded.requests[0]!;
        expect(request.requestId).toBe(-5);
        expect(request.filterStrings).toEqual(['Anvil Name']);
        expect(request.filterStringCause).toBe(14);
        expect(request.actions).toEqual([
            {
                type: ItemStackRequestActionType.TAKE,
                count: 3,
                source: {
                    container: { containerId: ContainerUiId.HOTBAR, dynamicId: 2 },
                    slotId: 1,
                    stackNetId: 42
                },
                destination: {
                    container: { containerId: ContainerUiId.CURSOR, dynamicId: null },
                    slotId: 0,
                    stackNetId: -5
                }
            },
            { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 7, repetitions: 2 },
            { type: ItemStackRequestActionType.MINE_BLOCK, hotbarSlot: 4 },
            { type: ItemStackRequestActionType.LAB_TABLE_COMBINE },
            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 99, repetitions: 1 }
        ]);
        expect(decoded.feof()).toBe(true);
    });
});
