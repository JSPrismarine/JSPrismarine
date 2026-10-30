import { describe, expect, it } from 'vitest';
import NetworkBinaryStream from '../NetworkBinaryStream';
import AnimateEntityPacket from './AnimateEntityPacket';

const string = (value: string): number[] => [Buffer.byteLength(value), ...Buffer.from(value, 'utf8')];

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

const DATA = {
    animation: 'animation.pig.baby_transform',
    nextState: 'default',
    stopExpression: 'q.is_baby',
    stopExpressionVersion: 2,
    controller: 'controller.animation.pig',
    blendOutTime: 0.5,
    runtimeIds: [1n, 300n]
};

const PAYLOAD = [
    0x9e,
    0x01, // packet id 158
    ...string(DATA.animation),
    ...string(DATA.nextState),
    ...string(DATA.stopExpression),
    0x02,
    0x00,
    0x00,
    0x00, // mStopExpressionVersion, int32 little-endian
    ...string(DATA.controller),
    ...f32(DATA.blendOutTime),
    0x02, // two runtime ids
    0x01,
    0xac,
    0x02
];

describe('AnimateEntityPacket', () => {
    it('writes animation names, version, blend time, and actor runtime ids', () => {
        const packet = new AnimateEntityPacket(DATA);

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(Buffer.from(PAYLOAD));
    });

    it('reads every field and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(Buffer.from(PAYLOAD));
        const data = new AnimateEntityPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes empty names and no runtime ids as zero bytes', () => {
        const packet = new AnimateEntityPacket({
            animation: '',
            nextState: '',
            stopExpression: '',
            stopExpressionVersion: 0,
            controller: '',
            blendOutTime: 0,
            runtimeIds: []
        });

        expect(packet.serialize(new NetworkBinaryStream())).toEqual(
            Buffer.from([0x9e, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, ...f32(0), 0x00])
        );
    });
});
