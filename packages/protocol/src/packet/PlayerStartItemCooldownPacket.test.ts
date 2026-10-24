import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayerStartItemCooldownPacket from './PlayerStartItemCooldownPacket';

import type { PlayerStartItemCooldown } from './PlayerStartItemCooldownPacket';

const DATA: PlayerStartItemCooldown = {
    itemCategory: 'ender_pearl',
    durationTicks: 100
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb0, 0x01], // packet id header, 176 as a varuint32
    ...[0x0b, ...Buffer.from('ender_pearl', 'utf8')], // Item Category "ender_pearl", 11 bytes
    ...[0xc8, 0x01] // Duration Ticks 100, ZigZag varint32 (100 encodes as 200)
]);

/** A negative duration, which only ZigZag encoding keeps to two bytes. */
const NEGATIVE: PlayerStartItemCooldown = {
    itemCategory: '',
    durationTicks: -1
};

/** `NEGATIVE` on the wire: the header, an empty category, and -1 as ZigZag 1. */
const NEGATIVE_BYTES = Buffer.from([0xb0, 0x01, 0x00, 0x01]);

describe('PlayerStartItemCooldownPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new PlayerStartItemCooldownPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new PlayerStartItemCooldownPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes the duration as a ZigZag varint', () => {
        const buffer = new PlayerStartItemCooldownPacket(NEGATIVE).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...NEGATIVE_BYTES]);
    });

    it('reads a negative duration back', () => {
        const stream = new NetworkBinaryStream(NEGATIVE_BYTES);
        const data = new PlayerStartItemCooldownPacket().deserialize(stream);

        expect(data).toEqual(NEGATIVE);
        expect(stream.feof()).toBe(true);
    });
});
