import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { containerOpenPacket, layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { packetIds as packetIds2193 } from '../wire/versions/v2193';
import { packetIds as packetIds2225 } from '../wire/versions/v2225';

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

    // The docs list no change to this packet between 1.26.50 and 1.26.60, so both versions
    // write the same bytes and carry the same id.
    it('has the same id at protocol 2193 and 2225', () => {
        expect(packetIds2193.ContainerOpenPacket).toBe(0x2e);
        expect(packetIds2225.ContainerOpenPacket).toBe(0x2e);
    });

    it.each([2193, 2225])('matches the bytes the class wrote at protocol %i', (protocol) => {
        const packet = fill();

        const expected = new BinaryStream();
        expected.writeByte(packet.windowId);
        expected.writeByte(packet.containerType);
        expected.writeVarInt(Math.floor(packet.containerPos.getX()));
        expected.writeVarInt(Math.floor(packet.containerPos.getY()));
        expected.writeVarInt(Math.floor(packet.containerPos.getZ()));
        expected.writeVarLong(packet.containerEntityId);

        const stream = new BinaryStream();
        layoutAt(containerOpenPacket, protocol).encode(stream, {
            windowId: packet.windowId,
            containerType: packet.containerType,
            position: floored(packet.containerPos),
            containerEntityId: packet.containerEntityId
        });

        expect(stream.getBuffer()).toEqual(expected.getBuffer());

        const read = layoutAt(containerOpenPacket, protocol).decode(new BinaryStream(stream.getBuffer()));
        expect(read.position).toEqual(floored(packet.containerPos));
        expect(read.containerEntityId).toBe(packet.containerEntityId);
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
