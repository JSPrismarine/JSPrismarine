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
                const dynamicId = stream.readBoolean() ? stream.readIntLE() : null;
                const slots = [];
                for (let k = 0, m = stream.readUnsignedVarInt(); k < m; k++) {
                    slots.push({
                        slot: stream.readByte(),
                        hotbarSlot: stream.readByte(),
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
                                hotbarSlot: 3,
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
                                slot: 3,
                                hotbarSlot: 3,
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

    it('leaves out a stack net id that is not positive, as an absent optional', () => {
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
                                hotbarSlot: 0,
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
});
