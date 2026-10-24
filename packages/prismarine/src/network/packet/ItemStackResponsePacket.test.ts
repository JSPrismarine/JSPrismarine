import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { NetworkUtil } from '../NetworkUtil';
import ItemStackResponsePacket, { ItemStackResponseResult } from './ItemStackResponsePacket';

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
                                slot: 3,
                                count: 16,
                                itemStackId: 77,
                                customName: '',
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
                                slot: 0,
                                count: 0,
                                itemStackId: 0,
                                customName: '',
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
                        slots: [{ slot: 28, count: 0, itemStackId: 0, customName: '', durabilityCorrection: 0 }]
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
                        slots: [{ slot: 3, count: 16, itemStackId: 77, customName: '', durabilityCorrection: 0 }]
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
                        slots: [{ slot: 0, count: 1, itemStackId: 1, customName: '', durabilityCorrection: 40000 }]
                    }
                ]
            }
        ];

        expect(() => encode(packet)).toThrow(RangeError);
    });
});
