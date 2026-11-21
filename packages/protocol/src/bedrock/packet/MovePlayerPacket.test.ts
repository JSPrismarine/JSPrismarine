import { describe, expect, it } from 'vitest';
import { Vector3 } from '@jsprismarine/math';

import NetworkBinaryStream from '../../NetworkBinaryStream';
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
    position: new Vector3(1.5, 64.25, -3.75),
    pitch: 12.5,
    yaw: -45,
    headYaw: 30,
    mode: PositionMode.Normal,
    onGround: true,
    ridingEntityRuntimeId: 9n,
    teleportData: null,
    tick: 300n
};

const teleport: MovePlayer = {
    ...normal,
    mode: PositionMode.Teleport,
    teleportData: { cause: 3, sourceActorType: 7 }
};

const encode = (data: MovePlayer, protocol?: number): Buffer => {
    const packet = new MovePlayerPacket(data);
    if (protocol !== undefined) packet.codecProtocol = protocol;
    return packet.serialize(new NetworkBinaryStream());
};

const decode = (buffer: Buffer, protocol: number): MovePlayer => {
    const packet = new MovePlayerPacket();
    packet.codecProtocol = protocol;
    return packet.deserialize(new NetworkBinaryStream(buffer));
};

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
        expect(data.teleportData).toBeNull();
        expect(stream.feof()).toBe(true);
    });

    // The 1.26.50 and 1.26.60 pages describe the packet identically, so both versions share one layout.
    describe.each([2193, 2225])('at protocol %i', (protocol) => {
        it('round-trips a normal move and a teleport byte for byte', () => {
            expect(encode(normal, protocol)).toEqual(wire(PositionMode.Normal));
            expect(encode(teleport, protocol)).toEqual(wire(PositionMode.Teleport, { cause: 3, sourceActorType: 7 }));
            expect(decode(wire(PositionMode.Normal), protocol)).toEqual(normal);
            expect(decode(wire(PositionMode.Teleport, { cause: 3, sourceActorType: 7 }), protocol)).toEqual(teleport);
        });

        it('leaves Teleport Data off the wire when the mode is not Teleport', () => {
            const stray: MovePlayer = { ...normal, teleportData: { cause: 3, sourceActorType: 7 } };

            expect(encode(stray, protocol)).toEqual(wire(PositionMode.Normal));
        });

        it('writes zeros for a teleport that carries no Teleport Data', () => {
            const bare: MovePlayer = { ...teleport, teleportData: null };

            expect(encode(bare, protocol)).toEqual(wire(PositionMode.Teleport, { cause: 0, sourceActorType: 0 }));
        });

        it('reads Teleport Data by its presence byte, whatever the mode says', () => {
            const odd = decode(wire(PositionMode.Normal, { cause: 3, sourceActorType: 7 }), protocol);

            expect(odd.mode).toBe(PositionMode.Normal);
            expect(odd.teleportData).toEqual({ cause: 3, sourceActorType: 7 });
            expect(odd.tick).toBe(300n);
            expect(decode(wire(PositionMode.Teleport), protocol).teleportData).toBeNull();
        });
    });
});
