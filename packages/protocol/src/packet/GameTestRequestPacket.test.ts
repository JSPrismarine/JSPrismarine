import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import BlockPos from '../structure/BlockPos';
import GameTestRequestPacket, { Rotation } from './GameTestRequestPacket';

import type { GameTestRequest } from './GameTestRequestPacket';

const DATA: GameTestRequest = {
    maxTestsPerBatch: 5,
    repeatCount: 3,
    rotation: Rotation.Rotate90,
    stopOnFailure: true,
    testPosition: new BlockPos(10, -5, 200),
    testsPerRow: 8,
    testName: 'farm:crops'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xc2, 0x01], // packet id header: 194 as a varuint32
    0x0a, // MaxTestsPerBatch 5, ZigZag varint32
    0x06, // RepeatCount 3, ZigZag varint32
    0x01, // Rotation Rotate90, one byte
    0x01, // StopOnFailure
    0x14, // TestPos X 10, ZigZag varint32
    0x09, // TestPos Y -5, ZigZag varint32
    ...[0x90, 0x03], // TestPos Z 200, ZigZag varint32 (400 in two bytes)
    0x10, // TestsPerRow 8, ZigZag varint32
    ...[0x0a, ...Buffer.from('farm:crops', 'utf8')] // TestName, 10 bytes
]);

describe('GameTestRequestPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new GameTestRequestPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new GameTestRequestPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a single unrotated run at a negative position', () => {
        const single: GameTestRequest = {
            maxTestsPerBatch: 1,
            repeatCount: 1,
            rotation: Rotation.None,
            stopOnFailure: false,
            testPosition: new BlockPos(-1000, 64, -1),
            testsPerRow: 1,
            testName: ''
        };
        const buffer = new GameTestRequestPacket(single).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new GameTestRequestPacket().deserialize(stream)).toEqual(single);
        expect(stream.feof()).toBe(true);
    });

    it('numbers the clockwise names as aliases of the quarter turns', () => {
        expect(Rotation.Clockwise90).toBe(Rotation.Rotate90);
        expect(Rotation.Clockwise180).toBe(Rotation.Rotate180);
        expect(Rotation.CounterClockwise90).toBe(Rotation.Rotate270);
    });
});
