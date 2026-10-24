import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import PositionMode from '../type/PositionMode';
import MovePlayerPacket from './MovePlayerPacket';

/**
 * The packet as protocol 2193 lays it out, written by hand in the docs' order so the test
 * does not take the encoder's word for it. Teleport Data is an optional: one presence byte,
 * then Teleportation Cause and Source Actor Type as int32 LE when the byte is 0x01. The tick
 * is 300, which takes two varuint bytes, so a reader that eats the presence byte as the
 * tick's first byte gets a different number.
 */
const wire = (mode: PositionMode, teleport?: { cause: number; sourceActorType: number }): Buffer => {
    const out = new BinaryStream();
    out.writeUnsignedVarInt(19); // Header: the packet id, no subclient ids.
    out.writeUnsignedVarLong(42n); // Player Runtime ID.
    out.writeFloatLE(1.5); // Position.
    out.writeFloatLE(64.25);
    out.writeFloatLE(-3.75);
    out.writeFloatLE(12.5); // Rotation: pitch, then yaw.
    out.writeFloatLE(-45);
    out.writeFloatLE(30); // Y-Head Rotation.
    out.writeByte(mode); // Position Mode.
    out.writeBoolean(true); // On Ground.
    out.writeUnsignedVarLong(9n); // Riding Runtime ID.
    if (teleport) {
        out.writeBoolean(true); // Teleport Data present.
        out.writeIntLE(teleport.cause);
        out.writeIntLE(teleport.sourceActorType);
    } else {
        out.writeBoolean(false); // Teleport Data absent.
    }
    out.writeUnsignedVarLong(300n); // Tick.
    return out.getBuffer();
};

const move = (mode: PositionMode): MovePlayerPacket => {
    const packet = new MovePlayerPacket();
    packet.runtimeEntityId = 42n;
    packet.position = new Vector3(1.5, 64.25, -3.75);
    packet.pitch = 12.5;
    packet.yaw = -45;
    packet.headYaw = 30;
    packet.mode = mode;
    packet.onGround = true;
    packet.ridingEntityRuntimeId = 9n;
    packet.tick = 300n;
    return packet;
};

const decode = (buffer: Buffer): MovePlayerPacket => {
    const packet = new MovePlayerPacket(buffer);
    packet.decode();
    return packet;
};

describe('MovePlayerPacket', () => {
    it('writes a normal move with an absent Teleport Data before the tick', () => {
        const packet = move(PositionMode.Normal);
        packet.encode();

        expect(packet.getBuffer()).toEqual(wire(PositionMode.Normal));
        // The tail, byte for byte: presence 0x00, then 300 as a varuint.
        expect([...packet.getBuffer().subarray(-3)]).toEqual([0x00, 0xac, 0x02]);
    });

    it('writes a teleport with its cause and source actor type as int32 LE', () => {
        const packet = move(PositionMode.Teleport);
        packet.teleportCause = 3;
        packet.teleportItemId = 7;
        packet.encode();

        expect(packet.getBuffer()).toEqual(wire(PositionMode.Teleport, { cause: 3, sourceActorType: 7 }));
        expect([...packet.getBuffer().subarray(-11)]).toEqual([0x01, 3, 0, 0, 0, 7, 0, 0, 0, 0xac, 0x02]);
    });

    it('reads a teleport and nothing past it', () => {
        const packet = decode(wire(PositionMode.Teleport, { cause: 3, sourceActorType: 7 }));

        expect(packet.runtimeEntityId).toBe(42n);
        expect(packet.position.getX()).toBe(1.5);
        expect(packet.position.getY()).toBe(64.25);
        expect(packet.position.getZ()).toBe(-3.75);
        expect(packet.pitch).toBe(12.5);
        expect(packet.yaw).toBe(-45);
        expect(packet.headYaw).toBe(30);
        expect(packet.mode).toBe(PositionMode.Teleport);
        expect(packet.onGround).toBe(true);
        expect(packet.ridingEntityRuntimeId).toBe(9n);
        expect(packet.teleportCause).toBe(3);
        expect(packet.teleportItemId).toBe(7);
        expect(packet.tick).toBe(300n);
        expect(packet.feof()).toBe(true);
    });

    it('reads a normal move without taking the presence byte for the tick', () => {
        const packet = decode(wire(PositionMode.Normal));

        expect(packet.mode).toBe(PositionMode.Normal);
        expect(packet.teleportCause).toBeUndefined();
        expect(packet.teleportItemId).toBeUndefined();
        expect(packet.tick).toBe(300n);
        expect(packet.feof()).toBe(true);
    });
});
