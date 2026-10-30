import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt, movePlayerPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import PositionMode from '../type/PositionMode';
import MovePlayerPacket from './MovePlayerPacket';

/**
 * The declarative layout must write the bytes the hand-written encoder wrote, with and without
 * the teleport data the encoder only emits in Teleport mode, and must read back what it wrote
 * with nothing left in the stream.
 */
describe('the declarative MovePlayer layout', () => {
    const fill = (mode: number): MovePlayerPacket => {
        const packet = new MovePlayerPacket();
        packet.runtimeEntityId = 7n;
        packet.position = new Vector3(1.5, 2.25, -3.5);
        packet.pitch = 10.5;
        packet.yaw = -20.25;
        packet.headYaw = 30.75;
        packet.mode = mode;
        packet.onGround = true;
        packet.ridingEntityRuntimeId = 9n;
        packet.teleportCause = 3;
        packet.teleportItemId = -4;
        packet.tick = 123n;
        return packet;
    };

    const payloadOf = (packet: MovePlayerPacket) => ({
        runtimeEntityId: packet.runtimeEntityId,
        position: packet.position,
        pitch: packet.pitch,
        yaw: packet.yaw,
        headYaw: packet.headYaw,
        mode: packet.mode,
        onGround: packet.onGround,
        ridingEntityRuntimeId: packet.ridingEntityRuntimeId,
        teleportData:
            packet.mode === PositionMode.Teleport
                ? { cause: packet.teleportCause, sourceActorType: packet.teleportItemId }
                : null,
        tick: packet.tick
    });

    it.each([
        ['a normal move', PositionMode.Normal],
        ['a teleport', PositionMode.Teleport]
    ])('matches the class byte for byte for %s', (_name, mode) => {
        const classPacket = fill(mode);
        const expected = new BinaryStream();
        // The bytes the hand-written encoder produced, inlined so the layout is held to them.
        expected.writeUnsignedVarLong(classPacket.runtimeEntityId);
        expected.writeFloatLE(classPacket.position.getX());
        expected.writeFloatLE(classPacket.position.getY());
        expected.writeFloatLE(classPacket.position.getZ());
        expected.writeFloatLE(classPacket.pitch);
        expected.writeFloatLE(classPacket.yaw);
        expected.writeFloatLE(classPacket.headYaw);
        expected.writeByte(classPacket.mode);
        expected.writeBoolean(classPacket.onGround);
        expected.writeUnsignedVarLong(classPacket.ridingEntityRuntimeId);
        const teleporting = classPacket.mode === PositionMode.Teleport;
        expected.writeBoolean(teleporting);
        if (teleporting) {
            expected.writeIntLE(classPacket.teleportCause);
            expected.writeIntLE(classPacket.teleportItemId);
        }
        expected.writeUnsignedVarLong(classPacket.tick);

        const stream = new BinaryStream();
        layoutAt(movePlayerPacket, 2193).encode(stream, payloadOf(classPacket));

        expect(stream.getBuffer()).toEqual(expected.getBuffer());
    });

    it('round-trips through the packet class and consumes the payload', () => {
        const sent = fill(PositionMode.Teleport);
        sent.encodePayload();

        const received = new MovePlayerPacket(sent.getBuffer());
        received.decodePayload();

        expect(payloadOf(received)).toEqual(payloadOf(sent));
        expect(received.feof()).toBe(true);
    });
});
