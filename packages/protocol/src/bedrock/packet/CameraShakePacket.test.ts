import { describe, expect, it } from 'vitest';

import CameraShakePacket, { CameraShakeAction, CameraShakeType } from './CameraShakePacket';

// Packet id 159 as a varuint.
const HEADER = [0x9f, 0x01];

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

describe('CameraShakePacket', () => {
    it('writes the two floats then the type and the action as single bytes', () => {
        const packet = new CameraShakePacket();
        packet.intensity = 2.5;
        packet.seconds = 1.5;
        packet.shakeType = CameraShakeType.Rotational;
        packet.shakeAction = CameraShakeAction.Stop;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...f32(2.5), ...f32(1.5), 0x01, 0x01]));
    });

    it('reads the intensity, the duration, the type and the action, consuming the whole buffer', () => {
        const packet = new CameraShakePacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...f32(4), ...f32(0.25), 0x00, 0x00]));
        packet.decode();

        expect(packet.intensity).toBe(4);
        expect(packet.seconds).toBe(0.25);
        expect(packet.shakeType).toBe(CameraShakeType.Positional);
        expect(packet.shakeAction).toBe(CameraShakeAction.Add);
        expect(packet.feof()).toBe(true);
    });
});
