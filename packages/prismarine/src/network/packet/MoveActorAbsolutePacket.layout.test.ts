import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt, moveActorAbsolutePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import MoveActorAbsolutePacket from './MoveActorAbsolutePacket';

/**
 * The layout must write the bytes the hand-written encoder wrote, rotations included: those
 * travel as a 256th of a turn each, so the round trip is only exact for angles that land on
 * one of the 256 steps.
 */
describe('the declarative MoveActorAbsolute layout', () => {
    const fill = (): MoveActorAbsolutePacket => {
        const packet = new MoveActorAbsolutePacket();
        packet.runtimeEntityId = 11n;
        packet.flags = MoveActorAbsolutePacket.FLAG_ON_GROUND | MoveActorAbsolutePacket.FLAG_TELEPORT;
        packet.position = new Vector3(4.5, 70.25, -12.75);
        packet.pitch = 45;
        packet.yaw = 180;
        packet.headYaw = 270;
        return packet;
    };

    const payloadOf = (packet: MoveActorAbsolutePacket) => ({
        runtimeEntityId: packet.runtimeEntityId,
        flags: packet.flags,
        position: packet.position,
        pitch: packet.pitch,
        yaw: packet.yaw,
        headYaw: packet.headYaw
    });

    it('matches the bytes the class wrote', () => {
        const packet = fill();
        const toByte = (degrees: number) => Math.round(degrees / (360 / 256)) & 0xff;

        const expected = new BinaryStream();
        expected.writeUnsignedVarLong(packet.runtimeEntityId);
        expected.writeByte(packet.flags);
        expected.writeFloatLE(packet.position.getX());
        expected.writeFloatLE(packet.position.getY());
        expected.writeFloatLE(packet.position.getZ());
        expected.writeByte(toByte(packet.pitch));
        expected.writeByte(toByte(packet.yaw));
        expected.writeByte(toByte(packet.headYaw));

        const stream = new BinaryStream();
        layoutAt(moveActorAbsolutePacket, 2193).encode(stream, payloadOf(packet));

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill();
        sent.encodePayload();

        const received = new MoveActorAbsolutePacket(sent.getBuffer());
        received.decodePayload();

        expect(payloadOf(received)).toEqual(payloadOf(sent));
        expect(received.feof()).toBe(true);
    });
});
