import BinaryStream from '@jsprismarine/binaryutils';
import { ContainerUiId } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { itemStackResponsePacket } from '../wire/definitions/itemStackResponse';
import { NetworkUtil } from '../wire/networkUtil';
import { layoutAt } from '../wire/WireLayout';
import ItemStackResponsePacket, { ItemStackResponseResult } from './ItemStackResponsePacket';
import { enumDumpMembers } from '../testing/evidence.test.helper';

/**
 * Reads the packet back the way a client of protocol 2193 does, from gophertunnel's
 * `protocol/item_stack.go`. Written by hand rather than with a decoder of the packet's own,
 * so that the layout is pinned to the protocol and not to the writer.
 */
const readBack = (buffer: Buffer) => {
    const stream = new BinaryStream(buffer);
    expect(stream.readUnsignedVarInt()).toBe(0x94); // Header.

    const responses = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const result = stream.readByte();
        const requestId = stream.readVarInt();
        const containers = [];
        if (stream.readBoolean()) {
            for (let j = 0, n = stream.readUnsignedVarInt(); j < n; j++) {
                const containerId = stream.readByte();
                const dynamicId = stream.readBoolean() ? stream.readUnsignedIntLE() : null;
                const slots = [];
                for (let k = 0, m = stream.readUnsignedVarInt(); k < m; k++) {
                    slots.push({
                        requestedSlot: stream.readByte(),
                        slot: stream.readByte(),
                        count: stream.readByte(),
                        stackNetId: stream.readBoolean() ? stream.readVarInt() : null,
                        customName: NetworkUtil.readString(stream),
                        filteredCustomName: stream.readBoolean() ? NetworkUtil.readString(stream) : null,
                        durabilityCorrection: stream.readVarInt()
                    });
                }
                containers.push({ containerId, dynamicId, slots });
            }
        }
        responses.push({ result, requestId, containers });
    }

    expect(stream.feof()).toBe(true);
    return responses;
};

const encode = (packet: ItemStackResponsePacket): Buffer => {
    packet.encode();
    return packet.getBuffer();
};

describe('ItemStackResponsePacket', () => {
    it('writes an accepted request with the slots it changed', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: -5,
                containers: [
                    {
                        container: { containerId: 12, dynamicId: null },
                        slots: [
                            {
                                requestedSlot: 3,
                                slot: 3,
                                count: 16,
                                itemStackId: 77,
                                customName: '',
                                redactedCustomName: null,
                                durabilityCorrection: 0
                            }
                        ]
                    }
                ]
            }
        ];

        expect(readBack(encode(packet))).toEqual([
            {
                result: ItemStackResponseResult.OK,
                requestId: -5,
                containers: [
                    {
                        containerId: 12,
                        dynamicId: null,
                        slots: [
                            {
                                requestedSlot: 3,
                                slot: 3,
                                count: 16,
                                stackNetId: 77,
                                customName: '',
                                filteredCustomName: null,
                                durabilityCorrection: 0
                            }
                        ]
                    }
                ]
            }
        ]);
    });

    it('leaves out the stack net id of an empty slot, as an absent optional', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: 1,
                containers: [
                    {
                        container: { containerId: 0, dynamicId: 9 },
                        slots: [
                            {
                                requestedSlot: 0,
                                slot: 0,
                                count: 0,
                                itemStackId: 0,
                                customName: '',
                                redactedCustomName: null,
                                durabilityCorrection: 0
                            }
                        ]
                    }
                ]
            }
        ];

        const [response] = readBack(encode(packet));
        expect(response!.containers[0]!.dynamicId).toBe(9);
        expect(response!.containers[0]!.slots[0]!.stackNetId).toBeNull();
    });

    it('writes the changed slot under both Requested Slot and Slot', () => {
        // The two carry the same number. Writing zero for the second one answered for the
        // crafting grid's slot 28 with "slot 0 changed", which is the first square of the grid
        // whichever square actually emptied.
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: 2,
                containers: [
                    {
                        container: { containerId: 13, dynamicId: null },
                        slots: [
                            {
                                requestedSlot: 28,
                                slot: 28,
                                count: 0,
                                itemStackId: 0,
                                customName: '',
                                redactedCustomName: null,
                                durabilityCorrection: 0
                            }
                        ]
                    }
                ]
            }
        ];

        const slot = readBack(encode(packet))[0]!.containers[0]!.slots[0]!;
        expect(slot.requestedSlot).toBe(28);
        expect(slot.slot).toBe(28);
    });

    it('writes a refusal as a result and a request id, followed by a byte saying no containers', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [{ result: ItemStackResponseResult.ERROR, requestId: -3, containers: [] }];

        // A two byte header, the count, the result, the request id, and the presence byte:
        // leaving that last one out, as 748 did, hands the client the next response's count
        // as it.
        expect(encode(packet)).toHaveLength(6);
        expect(readBack(encode(packet))).toEqual([
            { result: ItemStackResponseResult.ERROR, requestId: -3, containers: [] }
        ]);
    });

    it('writes an accepted request that changed nothing as a present, empty container list', () => {
        // Containers is tied to the result, not to whether there is anything in it. A success
        // whose presence byte said false read back in the shape of a refusal.
        const packet = new ItemStackResponsePacket();
        packet.responses = [{ result: ItemStackResponseResult.OK, requestId: -1, containers: [] }];

        expect(encode(packet)).toEqual(
            Buffer.from([
                0x94, // Header: 148.
                0x01,
                0x01, // Responses: one.
                0x00, // Result: Success.
                0x01, // Client Request Id: -1 as a ZigZag varint32.
                0x01, // Containers: present.
                0x00 // Containers: none.
            ])
        );
    });

    it('pins the bytes of one changed slot', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: -3,
                containers: [
                    {
                        container: { containerId: 12, dynamicId: null },
                        slots: [
                            {
                                requestedSlot: 3,
                                slot: 3,
                                count: 16,
                                itemStackId: 77,
                                customName: '',
                                redactedCustomName: null,
                                durabilityCorrection: 0
                            }
                        ]
                    }
                ]
            }
        ];

        expect(encode(packet)).toEqual(
            Buffer.from([
                0x94, // Header: 148.
                0x01,
                0x01, // Responses: one.
                0x00, // Result: Success.
                0x05, // Client Request Id: -3 as a ZigZag varint32.
                0x01, // Containers: present.
                0x01, // Containers: one.
                0x0c, // Full Container Name: CombinedHotbarAndInventoryContainer.
                0x00, // Full Container Name: no Dynamic ID.
                0x01, // Slots: one.
                0x03, // Requested Slot.
                0x03, // Slot.
                0x10, // Amount: 16.
                0x01, // Item Stack Net Id: present, because the amount is above zero.
                0x9a, // Item Stack Net Id: 77 as a ZigZag varint32.
                0x01,
                0x00, // Custom Name: Unredacted, empty.
                0x00, // Custom Name: no Redacted string.
                0x00 // Durability Correction: 0.
            ])
        );
    });

    it('writes the dynamic id of a container as four unsigned bytes', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: -1,
                containers: [{ container: { containerId: 63, dynamicId: 0xfffffffe }, slots: [] }]
            }
        ];

        const [response] = readBack(encode(packet));
        expect(response!.containers[0]!.dynamicId).toBe(0xfffffffe);
    });

    it('refuses a durability correction that does not fit an int16', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: -1,
                containers: [
                    {
                        container: { containerId: 12, dynamicId: null },
                        slots: [
                            {
                                requestedSlot: 0,
                                slot: 0,
                                count: 1,
                                itemStackId: 1,
                                customName: '',
                                redactedCustomName: null,
                                durabilityCorrection: 40000
                            }
                        ]
                    }
                ]
            }
        ];

        expect(() => encode(packet)).toThrow(RangeError);
    });

    it('round-trips an acceptance and a refusal', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: -1,
                containers: [
                    {
                        container: { containerId: 12, dynamicId: 7 },
                        slots: [
                            {
                                requestedSlot: 3,
                                slot: 3,
                                count: 0,
                                itemStackId: 0,
                                customName: '',
                                redactedCustomName: null,
                                durabilityCorrection: 0
                            },
                            {
                                requestedSlot: 5,
                                slot: 5,
                                count: 2,
                                itemStackId: 9,
                                customName: 'Named',
                                redactedCustomName: null,
                                durabilityCorrection: -3
                            }
                        ]
                    }
                ]
            },
            { result: ItemStackResponseResult.ERROR, requestId: -3, containers: [] }
        ];

        const decoded = new ItemStackResponsePacket(encode(packet));
        decoded.decode();

        expect(decoded.responses).toEqual(packet.responses);
        expect(decoded.feof()).toBe(true);
    });

    it('keeps Requested Slot and Slot apart, and the Redacted half of Custom Name', () => {
        const packet = new ItemStackResponsePacket();
        packet.responses = [
            {
                result: ItemStackResponseResult.OK,
                requestId: 4,
                containers: [
                    {
                        container: { containerId: 12, dynamicId: null },
                        slots: [
                            {
                                requestedSlot: 2,
                                slot: 7,
                                count: 1,
                                itemStackId: 5,
                                customName: 'Named',
                                redactedCustomName: '*****',
                                durabilityCorrection: 0
                            }
                        ]
                    }
                ]
            }
        ];

        const slot = readBack(encode(packet))[0]!.containers[0]!.slots[0]!;
        expect(slot.requestedSlot).toBe(2);
        expect(slot.slot).toBe(7);
        expect(slot.filteredCustomName).toBe('*****');

        const decoded = new ItemStackResponsePacket(encode(packet));
        decoded.decode();
        expect(decoded.responses).toEqual(packet.responses);
    });

    // Protocol 2225's changelog for this packet only renumbers and adds `ContainerEnumName`
    // values, which Full Container Name carries as a plain uint8, so one layout serves both.
    it.each([2193, 2225])('round-trips the same bytes at protocol %i', (protocol) => {
        const layout = layoutAt(itemStackResponsePacket, protocol);
        const bytes = Buffer.from([
            0x02, // Responses: two.
            0x00, // Result: Success.
            0x05, // Client Request Id: -3.
            0x01, // Containers: present.
            0x01, // Containers: one.
            0x0c, // Full Container Name: 12.
            0x01, // Dynamic ID: present.
            0x07,
            0x00,
            0x00,
            0x00,
            0x01, // Slots: one.
            0x03, // Requested Slot.
            0x04, // Slot.
            0x10, // Amount: 16.
            0x01, // Item Stack Net Id: present.
            0x9a,
            0x01,
            0x00, // Custom Name: Unredacted, empty.
            0x00, // Custom Name: no Redacted string.
            0x00, // Durability Correction.
            0x01, // Result: Error.
            0x01, // Client Request Id: -1.
            0x00 // Containers: absent.
        ]);

        const stream = new BinaryStream(bytes);
        const payload = layout.decode(stream);
        expect(stream.feof()).toBe(true);

        const encoded = new BinaryStream();
        layout.encode(encoded, payload);
        expect(encoded.getBuffer()).toEqual(bytes);
    });

    // The ids Full Container Name carries at 2193 are Mojang's published numbering, from the
    // pinned `enums.html` dump, not the dense 0..n order the 1.26.50 docs page prints.
    it("numbers ContainerEnumName as Mojang's pinned enum dump does", () => {
        const pinned = new Map(enumDumpMembers('ContainerEnumName').map(({ name, value }) => [name, value]));

        const normalize = (name: string) =>
            name
                .replaceAll('_', '')
                .replace(/container$/i, '')
                .toLowerCase();
        const expected = new Map([...pinned].map(([name, value]) => [normalize(name), value]));
        const actual = new Map(
            Object.entries(ContainerUiId)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
                .map(([name, value]) => [normalize(name), value])
        );

        expect(pinned.size).toBeGreaterThan(60);
        expect(actual).toEqual(expected);
    });
});
