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
