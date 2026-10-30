import { describe, expect, it } from 'vitest';
import ClientMovementPredictionSyncPacket from './ClientMovementPredictionSyncPacket';

const f32 = (value: number): Buffer => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return buffer;
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
        const packet = new ClientMovementPredictionSyncPacket(buffer);
        packet.decode();

        expect(packet.actorFlags).toBe(0x101n);
        expect(packet.boundingBoxScale).toBe(1);
        expect(packet.boundingBoxWidth).toBeCloseTo(0.6);
        expect(packet.boundingBoxHeight).toBeCloseTo(1.8);
        expect(packet.movementSpeed).toBeCloseTo(0.1);
        expect(packet.underwaterMovementSpeed).toBeCloseTo(0.02);
        expect(packet.lavaMovementSpeed).toBeCloseTo(0.03);
        expect(packet.jumpStrength).toBeCloseTo(0.42);
        expect(packet.health).toBe(20);
        expect(packet.hunger).toBe(18);
        expect(packet.frictionModifier).toBeCloseTo(0.6);
        expect(packet.bounciness).toBe(0);
        expect(packet.airDragModifier).toBeCloseTo(0.98);
        expect(packet.actorUniqueId).toBe(1234n);
        expect(packet.actorFlyingState).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('decodes an empty flag set as a single zero byte', () => {
        const buffer = Buffer.concat([header, Buffer.from([0x00]), Buffer.alloc(12 * 4), Buffer.from([0x00, 0x00])]);
        const packet = new ClientMovementPredictionSyncPacket(buffer);
        packet.decode();

        expect(packet.actorFlags).toBe(0n);
        expect(packet.actorUniqueId).toBe(0n);
        expect(packet.feof()).toBe(true);
    });

    it('rejects a flag set that never ends', () => {
        const buffer = Buffer.concat([header, Buffer.alloc(30, 0xff)]);
        const packet = new ClientMovementPredictionSyncPacket(buffer);

        expect(() => packet.decode()).toThrow(/flag bit set/);
    });

    it('encodes a high flag bit across several bytes', () => {
        const packet = new ClientMovementPredictionSyncPacket();
        packet.actorFlags = 1n << 20n;
        packet.encode();

        // Bit 20 lives in byte 2 (bits 14 to 20) as 0x40, after two continuation bytes.
        expect(packet.getBuffer().subarray(0, 5)).toEqual(Buffer.from([0xc2, 0x02, 0x80, 0x80, 0x40]));
        expect(packet.getBuffer().length).toBe(2 + 3 + 12 * 4 + 1 + 1);
    });
});
