import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { containerOpenPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import ContainerOpenPacket from './ContainerOpenPacket';

/**
 * The layout must write the bytes the hand-written encoder wrote, the floor on each
 * coordinate included: the position arrives as a float vector and travels as three varints.
 */
describe('the declarative ContainerOpen layout', () => {
    const fill = (): ContainerOpenPacket => {
        const packet = new ContainerOpenPacket();
        packet.windowId = 2;
        packet.containerType = 0;
        packet.containerPos = new Vector3(10.75, -3.5, 128);
        packet.containerEntityId = -1n;
        return packet;
    };

    const floored = (position: Vector3) => ({
        x: Math.floor(position.getX()),
        y: Math.floor(position.getY()),
        z: Math.floor(position.getZ())
    });

    it('matches the bytes the class wrote', () => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeByte(packet.windowId);
        expected.writeByte(packet.containerType);
        expected.writeVarInt(Math.floor(packet.containerPos.getX()));
        expected.writeVarInt(Math.floor(packet.containerPos.getY()));
        expected.writeVarInt(Math.floor(packet.containerPos.getZ()));
        expected.writeVarLong(packet.containerEntityId);

        const stream = new BinaryStream();
        layoutAt(containerOpenPacket, 2193).encode(stream, {
            windowId: packet.windowId,
            containerType: packet.containerType,
            position: floored(packet.containerPos),
            containerEntityId: packet.containerEntityId
        });

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill();
        sent.encodePayload();

        const received = new ContainerOpenPacket(sent.getBuffer());
        received.decodePayload();

        expect(received.windowId).toBe(sent.windowId);
        expect(received.containerType).toBe(sent.containerType);
        expect(floored(received.containerPos)).toEqual(floored(sent.containerPos));
        expect(received.containerEntityId).toBe(sent.containerEntityId);
        expect(received.feof()).toBe(true);
    });
});
