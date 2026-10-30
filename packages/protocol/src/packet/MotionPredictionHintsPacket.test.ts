import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import MotionPredictionHintsPacket from './MotionPredictionHintsPacket';

import type { MotionPredictionHints } from './MotionPredictionHintsPacket';

const DATA: MotionPredictionHints = { runtimeId: 300n, motion: new Vec3(0.5, -1.25, 2), onGround: true };
const BYTES = Buffer.from([
    0x9d, 0x01, 0xac, 0x02, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xa0, 0xbf, 0x00, 0x00, 0x00, 0x40, 0x01
]);

describe('MotionPredictionHintsPacket', () => {
    it('writes the runtime id, motion vector, and ground flag', () => {
        expect(new MotionPredictionHintsPacket(DATA).serialize(new NetworkBinaryStream())).toEqual(BYTES);
    });

    it('reads a hand-built packet to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new MotionPredictionHintsPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });
});
