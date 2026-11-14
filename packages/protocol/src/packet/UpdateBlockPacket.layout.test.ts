import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt, updateBlockPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import UpdateBlockPacket, { UpdateBlockFlagsType, UpdateBlockLayerType } from './UpdateBlockPacket';

/** The layout must write the bytes the hand-written encoder wrote, and read them back whole. */
describe('the declarative UpdateBlock layout', () => {
    const fill = (): UpdateBlockPacket => {
        const packet = new UpdateBlockPacket();
        packet.x = 12;
        packet.y = -64;
        packet.z = 345;
        packet.blockRuntimeId = 987654;
        packet.flags = UpdateBlockFlagsType.Neighbors | UpdateBlockFlagsType.Network;
        packet.layer = UpdateBlockLayerType.Liquid;
        return packet;
    };

    const payloadOf = (packet: UpdateBlockPacket) => ({
        position: { x: packet.x, y: packet.y, z: packet.z },
        blockRuntimeId: packet.blockRuntimeId,
        flags: packet.flags,
        layer: packet.layer
    });

    it.each([2193, 2225])('matches the bytes the class wrote at protocol %i', (protocol) => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeVarInt(packet.x);
        expected.writeVarInt(packet.y);
        expected.writeVarInt(packet.z);
        expected.writeUnsignedVarInt(packet.blockRuntimeId);
        expected.writeUnsignedVarInt(packet.flags);
        expected.writeUnsignedVarInt(packet.layer);

        const stream = new BinaryStream();
        layoutAt(updateBlockPacket, protocol).encode(stream, payloadOf(packet));

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it.each([2193, 2225])('round-trips through the packet class at protocol %i', (protocol) => {
        const sent = fill();
        sent.codecProtocol = protocol;
        sent.encodePayload();

        const received = new UpdateBlockPacket(sent.getBuffer());
        received.codecProtocol = protocol;
        received.decodePayload();

        expect(payloadOf(received)).toEqual(payloadOf(sent));
        expect(received.feof()).toBe(true);
    });
});
