import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import MotionPredictionHintsPacket from './MotionPredictionHintsPacket';

// Packet id 157 as a varuint.
const HEADER = [0x9d, 0x01];

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

describe('MotionPredictionHintsPacket', () => {
    it('writes the runtime id, the motion vector and the ground flag', () => {
        const packet = new MotionPredictionHintsPacket();
        packet.runtimeId = 300n;
        packet.motion = new Vector3(0.5, -1.25, 2);
        packet.onGround = true;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([...HEADER, 0xac, 0x02, ...f32(0.5), ...f32(-1.25), ...f32(2), 0x01])
        );
    });

    it('reads the runtime id, the motion vector and the ground flag, consuming the whole buffer', () => {
        const packet = new MotionPredictionHintsPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x01, ...f32(0), ...f32(-0.5), ...f32(0), 0x00]));
        packet.decode();

        expect(packet.runtimeId).toBe(1n);
        expect(packet.motion.getX()).toBe(0);
        expect(packet.motion.getY()).toBe(-0.5);
        expect(packet.motion.getZ()).toBe(0);
        expect(packet.onGround).toBe(false);
        expect(packet.feof()).toBe(true);
    });
});
