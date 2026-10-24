import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import MovePlayerPacket, { PositionMode } from './MovePlayerPacket';

import type { MovePlayer } from './MovePlayerPacket';

/**
 * The packet as protocol 2193 lays it out, written by hand in the docs' order so the test
 * does not take the encoder's word for it. Teleport Data is an optional: one presence byte,
 * then Teleportation Cause and Source Actor Type as int32 LE when the byte is 0x01. The tick
 * is 300, which takes two varuint bytes, so a reader that eats the presence byte as the
 * tick's first byte gets a different number.
 */
const wire = (mode: PositionMode, teleport?: { cause: number; sourceActorType: number }): Buffer => {
    const out = new NetworkBinaryStream();
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

const normal: MovePlayer = {
    runtimeEntityId: 42n,
    position: { x: 1.5, y: 64.25, z: -3.75 },
    pitch: 12.5,
    yaw: -45,
    headYaw: 30,
    mode: PositionMode.Normal,
    onGround: true,
    ridingEntityRuntimeId: 9n,
    tick: 300n
};

const teleport: MovePlayer = { ...normal, mode: PositionMode.Teleport, teleportCause: 3, teleportItemId: 7 };

const encode = (data: MovePlayer): Buffer => new MovePlayerPacket(data).serialize(new NetworkBinaryStream());

describe('MovePlayerPacket', () => {
    it('writes a normal move with an absent Teleport Data before the tick', () => {
        const buffer = encode(normal);

        expect(buffer).toEqual(wire(PositionMode.Normal));
        // The tail, byte for byte: presence 0x00, then 300 as a varuint.
        expect([...buffer.subarray(-3)]).toEqual([0x00, 0xac, 0x02]);
    });

    it('writes a teleport with its cause and source actor type as int32 LE', () => {
        const buffer = encode(teleport);

        expect(buffer).toEqual(wire(PositionMode.Teleport, { cause: 3, sourceActorType: 7 }));
        expect([...buffer.subarray(-11)]).toEqual([0x01, 3, 0, 0, 0, 7, 0, 0, 0, 0xac, 0x02]);
    });

    it('reads a teleport and nothing past it', () => {
        const stream = new NetworkBinaryStream(wire(PositionMode.Teleport, { cause: 3, sourceActorType: 7 }));

        expect(new MovePlayerPacket().deserialize(stream)).toEqual(teleport);
        expect(stream.feof()).toBe(true);
    });

    it('reads a normal move without taking the presence byte for the tick', () => {
        const stream = new NetworkBinaryStream(wire(PositionMode.Normal));
        const data = new MovePlayerPacket().deserialize(stream);

        expect(data).toEqual(normal);
        expect(data).not.toHaveProperty('teleportCause');
        expect(stream.feof()).toBe(true);
    });
});
