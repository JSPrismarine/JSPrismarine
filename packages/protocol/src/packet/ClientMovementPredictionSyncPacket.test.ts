import { describe, expect, it } from 'vitest';
import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientMovementPredictionSyncPacket from './ClientMovementPredictionSyncPacket';

import type { ClientMovementPredictionSync } from './ClientMovementPredictionSyncPacket';

const f32 = (value: number): Buffer => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return buffer;
};

const DATA: ClientMovementPredictionSync = {
    actorFlags: 0n,
    boundingBoxScale: 0,
    boundingBoxWidth: 0,
    boundingBoxHeight: 0,
    movementSpeed: 0,
    underwaterMovementSpeed: 0,
    lavaMovementSpeed: 0,
    jumpStrength: 0,
    health: 0,
    hunger: 0,
    frictionModifier: 0,
    bounciness: 0,
    airDragModifier: 0,
    actorUniqueId: 0n,
    actorFlyingState: false
};

describe('ClientMovementPredictionSyncPacket', () => {
    // Header: id 322 as LEB128 is 0xc2 0x02.
    const header = Buffer.from([0xc2, 0x02]);

    it('decodes a two byte flag set, twelve floats, the id, and the flag, consuming the whole buffer', () => {
        const buffer = Buffer.concat([
            header,
            // Bits 0 and 8 set: byte 0 is 0x01 with continuation, byte 1 is 0x02.
            Buffer.from([0x81, 0x02]),
            f32(1), // scale
            f32(0.6), // width
            f32(1.8), // height
            f32(0.1), // movement speed
            f32(0.02), // underwater
            f32(0.03), // lava
            f32(0.42), // jump strength
            f32(20), // health
            f32(18), // hunger
            f32(0.6), // friction
            f32(0), // bounciness
            f32(0.98), // air drag
            Buffer.from([0xa4, 0x13]), // unique id 1234 zigzagged
            Buffer.from([0x01]) // flying
        ]);
        const stream = new NetworkBinaryStream(buffer);
        const data = new ClientMovementPredictionSyncPacket().deserialize(stream);

        expect(data.actorFlags).toBe(0x101n);
        expect(data.boundingBoxScale).toBe(1);
        expect(data.boundingBoxWidth).toBeCloseTo(0.6);
        expect(data.boundingBoxHeight).toBeCloseTo(1.8);
        expect(data.movementSpeed).toBeCloseTo(0.1);
        expect(data.underwaterMovementSpeed).toBeCloseTo(0.02);
        expect(data.lavaMovementSpeed).toBeCloseTo(0.03);
        expect(data.jumpStrength).toBeCloseTo(0.42);
        expect(data.health).toBe(20);
        expect(data.hunger).toBe(18);
        expect(data.frictionModifier).toBeCloseTo(0.6);
        expect(data.bounciness).toBe(0);
        expect(data.airDragModifier).toBeCloseTo(0.98);
        expect(data.actorUniqueId).toBe(1234n);
        expect(data.actorFlyingState).toBe(true);
        expect(stream.feof()).toBe(true);
    });

    it('decodes an empty flag set as a single zero byte', () => {
        const buffer = Buffer.concat([header, Buffer.from([0x00]), Buffer.alloc(12 * 4), Buffer.from([0x00, 0x00])]);
        const stream = new NetworkBinaryStream(buffer);
        const data = new ClientMovementPredictionSyncPacket().deserialize(stream);

        expect(data.actorFlags).toBe(0n);
        expect(data.actorUniqueId).toBe(0n);
        expect(stream.feof()).toBe(true);
    });

    it('rejects a flag set that never ends', () => {
        const buffer = Buffer.concat([header, Buffer.alloc(30, 0xff)]);

        expect(() => new ClientMovementPredictionSyncPacket().deserialize(new NetworkBinaryStream(buffer))).toThrow(
            /flag bit set/
        );
    });

    it('encodes a high flag bit across several bytes', () => {
        const buffer = new ClientMovementPredictionSyncPacket({ ...DATA, actorFlags: 1n << 20n }).serialize(
            new NetworkBinaryStream()
        );

        // Bit 20 lives in byte 2 (bits 14 to 20) as 0x40, after two continuation bytes.
        expect(buffer.subarray(0, 5)).toEqual(Buffer.from([0xc2, 0x02, 0x80, 0x80, 0x40]));
        expect(buffer.length).toBe(2 + 3 + 12 * 4 + 1 + 1);
    });

    it.each([2193, 2225])('round trips the same bytes at protocol %i', (version) => {
        const data: ClientMovementPredictionSync = {
            ...DATA,
            actorFlags: 0x101n,
            boundingBoxScale: 1,
            boundingBoxWidth: 0.5,
            boundingBoxHeight: 1.5,
            health: 20,
            actorUniqueId: 1234n,
            actorFlyingState: true
        };
        const out = new ClientMovementPredictionSyncPacket(data);
        out.codecProtocol = version;
        const bytes = out.serialize(new NetworkBinaryStream());

        // Id 322 at both versions: the packet is not renumbered at 2225.
        expect(bytes.subarray(0, 2)).toEqual(header);

        const back = new ClientMovementPredictionSyncPacket();
        back.codecProtocol = version;
        expect(back.deserialize(new NetworkBinaryStream(bytes))).toEqual(data);
    });
});
