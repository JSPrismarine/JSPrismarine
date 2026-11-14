import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import MovementEffectPacket, { MovementEffectType } from './MovementEffectPacket';

import type { MovementEffect } from './MovementEffectPacket';

const DATA: MovementEffect = {
    targetRuntimeId: 300n,
    effectType: MovementEffectType.GEYSER_BOOST,
    effectDuration: 40,
    tick: 128n
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbe, 0x02], // packet id header, 318 as a varuint32
    ...[0xac, 0x02], // Target Runtime ID 300, a varuint64
    0x04, // Effect ID GEYSER_BOOST (2), a ZigZag varint32
    0x50, // Effect Duration 40 ticks, a ZigZag varint32
    ...[0x80, 0x01] // Tick 128, a varuint64
]);

describe('MovementEffectPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new MovementEffectPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new MovementEffectPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it.each([2193, 2225])('writes and reads the same bytes at protocol %i', (protocol) => {
        const packet = new MovementEffectPacket(DATA);
        packet.codecProtocol = protocol;
        const buffer = packet.serialize(new NetworkBinaryStream());
        expect([...buffer]).toEqual([...BYTES]);

        const decoder = new MovementEffectPacket();
        decoder.codecProtocol = protocol;
        expect(decoder.deserialize(new NetworkBinaryStream(BYTES))).toEqual(DATA);
    });

    it("numbers the movement effects as the docs and Mojang's enum dump list them", () => {
        expect(MovementEffectType.GLIDE_BOOST).toBe(0);
        expect(MovementEffectType.DOLPHIN_BOOST).toBe(1);
        expect(MovementEffectType.GEYSER_BOOST).toBe(2);
    });

    it('round-trips a glide boost for an actor with a zero tick', () => {
        const glide: MovementEffect = {
            targetRuntimeId: 1n,
            effectType: MovementEffectType.GLIDE_BOOST,
            effectDuration: 30,
            tick: 0n
        };
        const buffer = new MovementEffectPacket(glide).serialize(new NetworkBinaryStream());
        const data = new MovementEffectPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual(glide);
    });
});
