import { describe, expect, it } from 'vitest';

import AnimateEntityPacket from './AnimateEntityPacket';

// Packet id 158 as a varuint.
const HEADER = [0x9e, 0x01];

const string = (value: string): number[] => [Buffer.byteLength(value), ...Buffer.from(value, 'utf8')];

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

const PAYLOAD = [
    ...string('animation.pig.baby_transform'),
    ...string('default'),
    ...string('q.is_baby'),
    0x02,
    0x00,
    0x00,
    0x00, // mStopExpressionVersion, int32 little-endian
    ...string('controller.animation.pig'),
    ...f32(0.5),
    0x02, // two runtime ids
    0x01,
    0xac,
    0x02
];

describe('AnimateEntityPacket', () => {
    it('writes the names, the stop expression version, the blend out time and the runtime ids', () => {
        const packet = new AnimateEntityPacket();
        packet.animation = 'animation.pig.baby_transform';
        packet.nextState = 'default';
        packet.stopExpression = 'q.is_baby';
        packet.stopExpressionVersion = 2;
        packet.controller = 'controller.animation.pig';
        packet.blendOutTime = 0.5;
        packet.runtimeIds = [1n, 300n];
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...PAYLOAD]));
    });

    it('reads every field and consumes the whole buffer', () => {
        const packet = new AnimateEntityPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...PAYLOAD]));
        packet.decode();

        expect(packet.animation).toBe('animation.pig.baby_transform');
        expect(packet.nextState).toBe('default');
        expect(packet.stopExpression).toBe('q.is_baby');
        expect(packet.stopExpressionVersion).toBe(2);
        expect(packet.controller).toBe('controller.animation.pig');
        expect(packet.blendOutTime).toBe(0.5);
        expect(packet.runtimeIds).toEqual([1n, 300n]);
        expect(packet.feof()).toBe(true);
    });

    it('writes empty names and no runtime ids as zero bytes', () => {
        const packet = new AnimateEntityPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([...HEADER, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, ...f32(0), 0x00])
        );
    });
});
