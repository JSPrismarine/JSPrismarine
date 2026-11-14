import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { NetworkUtil } from '../wire/networkUtil';
import { ContainerUiId, ItemStackRequestActionType } from '../wire/structures/ItemStackRequest';
import type { ItemStackRequest } from '../wire/structures/ItemStackRequest';
import ItemStackRequestPacket from './ItemStackRequestPacket';
import { enumDumpMembers } from '../testing/evidence.test.helper';

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

const decode = (buffer: Buffer, protocolVersion = 2193): ItemStackRequestPacket => {
    const packet = new ItemStackRequestPacket(buffer);
    packet.decode({ protocolVersion });
    return packet;
};

/** Protocol 2225 inserted CraftReservedAction before the two deprecated craft actions. */
const craftActions2225 = (): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(0x93); // Header: 147.
    out.writeUnsignedVarInt(1); // Requests.
    out.writeVarInt(-7); // Client Request Id.
    out.writeUnsignedVarInt(3); // Actions.
    out.writeUnsignedVarInt(18); // Variant index: CraftResults.
    out.writeByte(20); // Action type.
    out.write(
        Buffer.from([
            0x01, // Craft Results: one.
            0x01, // Item Descriptor: variant index, ItemName.
            0x01, // Descriptor Type, the same value again.
            0x0f, // Full Name: fifteen bytes.
            ...Buffer.from('minecraft:stick'),
            0x00, // Aux Value: 0.
            0x04, // Stack size: 4 as a uint16 LE.
            0x00,
            0x00, // Block Runtime Id: 0.
            0x00, // User Data Buffer: empty.
            0x01 // Num Crafts.
        ])
    );
    out.writeUnsignedVarInt(16); // Variant index: CraftReservedAction.
    out.writeByte(18); // Action type.
    NetworkUtil.writeString(out, 'crafting_table'); // Reserved Id.
    out.writeByte(2); // Num Crafts.
    out.writeUnsignedVarInt(17); // Variant index: CraftingNonImplemented.
    out.writeByte(19); // Action type.
    out.writeUnsignedVarInt(0); // Strings To Filter.
    out.writeIntLE(0); // StringsToFilterOrigin.

    return out.getBuffer();
};

/** One request holding every action the server models, with the optional Dynamic ID both ways. */
const everyAction = (): ItemStackRequest => {
    const slot = (containerId: number, dynamicId: number | null, slotId: number, stackNetId: number) => ({
        container: { containerId, dynamicId },
        slotId,
        stackNetId
    });
    return {
        requestId: -9,
        actions: [
            {
                type: ItemStackRequestActionType.TAKE,
                count: 2,
                source: slot(ContainerUiId.HOTBAR, 4, 1, 17),
                destination: slot(ContainerUiId.CURSOR, null, 0, 0)
            },
            {
                type: ItemStackRequestActionType.PLACE,
                count: 1,
                source: slot(ContainerUiId.CURSOR, null, 0, 0),
                destination: slot(ContainerUiId.INVENTORY, null, 9, -3)
            },
            {
                type: ItemStackRequestActionType.SWAP,
                source: slot(ContainerUiId.OFFHAND, null, 1, 5),
                destination: slot(ContainerUiId.INVENTORY, 70000, 2, 6)
            },
            { type: ItemStackRequestActionType.DROP, count: 3, source: slot(ContainerUiId.HOTBAR, null, 3, 8) },
            { type: ItemStackRequestActionType.DESTROY, count: 4, source: slot(ContainerUiId.HOTBAR, null, 3, 8) },
            {
                type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT,
                count: 5,
                source: slot(ContainerUiId.CRAFTING_INPUT, null, 28, 9)
            },
            { type: ItemStackRequestActionType.CRAFTING_CREATE_SPECIFIC_RESULT },
            { type: ItemStackRequestActionType.LAB_TABLE_COMBINE },
            { type: ItemStackRequestActionType.BEACON_PAYMENT },
            { type: ItemStackRequestActionType.MINE_BLOCK, hotbarSlot: 6 },
            { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 11, repetitions: 2 },
            { type: ItemStackRequestActionType.CRAFTING_RECIPE_AUTO, recipeNetId: 12, repetitions: 3 },
            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 400, repetitions: 1 },
            { type: ItemStackRequestActionType.CRAFTING_RECIPE_OPTIONAL },
            { type: ItemStackRequestActionType.CRAFT_REPAIR_AND_DISENCHANT, repetitions: 1 },
            { type: ItemStackRequestActionType.CRAFTING_LOOM },
            { type: ItemStackRequestActionType.CRAFTING_NON_IMPLEMENTED_DEPRECATED },
            { type: ItemStackRequestActionType.CRAFTING_RESULTS_DEPRECATED }
        ],
        filterStrings: ['name'],
        filterStringCause: 3
    };
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

    it('reads the shifted craft actions in protocol 2225 and round-trips them', () => {
        const packet = decode(craftActions2225(), 2225);

        expect(packet.requests[0]!.actions).toEqual([
            { type: ItemStackRequestActionType.CRAFTING_RESULTS_DEPRECATED },
            {
                type: ItemStackRequestActionType.CRAFTING_NON_IMPLEMENTED_DEPRECATED,
                reservedId: 'crafting_table',
                repetitions: 2
            },
            { type: ItemStackRequestActionType.CRAFTING_NON_IMPLEMENTED_DEPRECATED }
        ]);
        expect(packet.feof()).toBe(true);

        packet.encode({ protocolVersion: 2225 });
        const roundTrip = decode(packet.getBuffer()!, 2225);
        expect(roundTrip.requests).toEqual(packet.requests);
        expect(roundTrip.feof()).toBe(true);
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
    it.each([2193, 2225])(
        'round-trips every action, both Dynamic ID forms and the strings at %i',
        (protocolVersion) => {
            const packet = new ItemStackRequestPacket();
            packet.requests = [everyAction()];
            packet.encode({ protocolVersion });

            const decoded = decode(packet.getBuffer()!, protocolVersion);
            expect(decoded.requests).toEqual(packet.requests);
            expect(decoded.feof()).toBe(true);

            // Encoding what was decoded reproduces the same bytes, so the layout is stable.
            decoded.encode({ protocolVersion });
            expect(decoded.getBuffer()).toEqual(packet.getBuffer());
        }
    );

    it('writes the lab table as variant index 7 and action type 9 at both protocols', () => {
        // 2193 and 2225 agree here: the two deprecated container actions (7 and 8) leave the
        // oneOf list but keep their numbers, so the index runs two behind the type.
        for (const protocolVersion of [2193, 2225]) {
            const packet = new ItemStackRequestPacket();
            packet.requests = [
                {
                    requestId: 1,
                    actions: [{ type: ItemStackRequestActionType.LAB_TABLE_COMBINE }],
                    filterStrings: [],
                    filterStringCause: 0
                }
            ];
            packet.encode({ protocolVersion });

            // Header (two bytes), Requests, Client Request Id, Actions, variant index, action type.
            expect([...packet.getBuffer()!.subarray(2, 7)]).toEqual([1, 2, 1, 7, 9]);
        }
    });

    it("numbers the action types as the pinned game dump does, 9 and up rather than the 1.26.50 page's 7", () => {
        // No Bedrock Dedicated Server capture of this packet exists, so the dump is the
        // executable evidence; the 1.26.60 page and its changelog agree with it, and the 1.26.50
        // page's dense positions are the documentation being corrected.
        const dumpNames: Record<string, keyof typeof ItemStackRequestActionType> = {
            Take: 'TAKE',
            Place: 'PLACE',
            Swap: 'SWAP',
            Drop: 'DROP',
            Destroy: 'DESTROY',
            Consume: 'CRAFTING_CONSUME_INPUT',
            Create: 'CRAFTING_CREATE_SPECIFIC_RESULT',
            ScreenLabTableCombine: 'LAB_TABLE_COMBINE',
            ScreenBeaconPayment: 'BEACON_PAYMENT',
            ScreenHUDMineBlock: 'MINE_BLOCK',
            CraftRecipe: 'CRAFTING_RECIPE',
            CraftRecipeAuto: 'CRAFTING_RECIPE_AUTO',
            CraftCreative: 'CREATIVE_CREATE',
            CraftRecipeOptional: 'CRAFTING_RECIPE_OPTIONAL',
            CraftRepairAndDisenchant: 'CRAFT_REPAIR_AND_DISENCHANT',
            CraftLoom: 'CRAFTING_LOOM',
            CraftNonImplemented_DEPRECATEDASKTYLAING: 'CRAFTING_NON_IMPLEMENTED_DEPRECATED',
            CraftResults_DEPRECATEDASKTYLAING: 'CRAFTING_RESULTS_DEPRECATED'
        };
        const members = enumDumpMembers('ItemStackRequestActionType');

        for (const { name, value } of members) {
            const member = dumpNames[name];
            if (member === undefined) continue; // The two removed container actions and test-only entries.
            expect(ItemStackRequestActionType[member], name).toBe(value);
        }
        expect(members.filter(({ name }) => dumpNames[name] !== undefined)).toHaveLength(Object.keys(dumpNames).length);
    });

    it('numbers the container names as the pinned game dump does, with the recipe tabs at 64 to 66', () => {
        const members = enumDumpMembers('ContainerEnumName');
        const dumpValues = members.map(({ value }) => value).sort((a, b) => a - b);
        const enumValues = Object.values(ContainerUiId)
            .filter((value): value is number => typeof value === 'number')
            .sort((a, b) => a - b);

        expect(enumValues).toEqual(dumpValues.filter((value) => value <= Math.max(...enumValues)));
    });
});
