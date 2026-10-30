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

    it('matches the bytes the class wrote', () => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeVarInt(packet.x);
        expected.writeVarInt(packet.y);
        expected.writeVarInt(packet.z);
        expected.writeUnsignedVarInt(packet.blockRuntimeId);
        expected.writeUnsignedVarInt(packet.flags);
        expected.writeUnsignedVarInt(packet.layer);

        const stream = new BinaryStream();
        layoutAt(updateBlockPacket, 2193).encode(stream, payloadOf(packet));

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill();
        sent.encodePayload();

        const received = new UpdateBlockPacket(sent.getBuffer());
        received.decodePayload();

        expect(payloadOf(received)).toEqual(payloadOf(sent));
        expect(received.feof()).toBe(true);
    });
});
