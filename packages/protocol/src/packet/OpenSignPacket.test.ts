import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import OpenSignPacket from './OpenSignPacket';

import type { OpenSign } from './OpenSignPacket';

const DATA: OpenSign = {
    position: new BlockPos(1, -2, 3),
    isFrontSide: true
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xaf, 0x02], // packet id header: 303 as a varuint32
    0x02, // Pos X 1, ZigZag varint32
    0x03, // Pos Y -2, ZigZag varint32
    0x06, // Pos Z 3, ZigZag varint32
    0x01 // Is Front Side
]);

describe('OpenSignPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new OpenSignPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new OpenSignPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips the back side of a sign at a negative position', () => {
        const back: OpenSign = { position: new BlockPos(-100, 319, -64), isFrontSide: false };
        const buffer = new OpenSignPacket(back).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new OpenSignPacket().deserialize(stream)).toEqual(back);
        expect(stream.feof()).toBe(true);
    });
});
