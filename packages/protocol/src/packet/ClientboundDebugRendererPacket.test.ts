import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec3 from '../structure/Vec3';
import ClientboundDebugRendererPacket, { DebugRendererType } from './ClientboundDebugRendererPacket';

const string = (value: string): number[] => [Buffer.byteLength(value), ...Buffer.from(value, 'utf8')];

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

const COLOR = 0xffff0000 | 0;
const MARKER = {
    text: 'mark',
    position: new Vec3(1.5, 64, -2.5),
    color: COLOR,
    duration: 1500n
};
const ADD_CUBE = Buffer.from([
    0xa4,
    0x01,
    ...string(DebugRendererType.AddDebugMarkerCube),
    0x01,
    ...string(MARKER.text),
    ...f32(MARKER.position.x),
    ...f32(MARKER.position.y),
    ...f32(MARKER.position.z),
    0x00,
    0x00,
    0xff,
    0xff,
    0xdc,
    0x05,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00
]);

describe('ClientboundDebugRendererPacket', () => {
    it('writes a clear as the type string and an empty optional', () => {
        const data = { type: DebugRendererType.ClearDebugMarkers, debugMarkerData: null };
        const expected = Buffer.from([0xa4, 0x01, ...string(data.type), 0x00]);

        expect(new ClientboundDebugRendererPacket(data).serialize(new NetworkBinaryStream())).toEqual(expected);
    });

    it('writes the marker data behind the presence byte', () => {
        const data = { type: DebugRendererType.AddDebugMarkerCube, debugMarkerData: MARKER };

        expect(new ClientboundDebugRendererPacket(data).serialize(new NetworkBinaryStream())).toEqual(ADD_CUBE);
    });

    it('reads marker data and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(ADD_CUBE);
        const decoded = new ClientboundDebugRendererPacket().deserialize(stream);

        expect(decoded.type).toBe(DebugRendererType.AddDebugMarkerCube);
        expect(decoded.debugMarkerData?.text).toBe('mark');
        expect(decoded.debugMarkerData?.position.y).toBe(64);
        expect(decoded.debugMarkerData?.color).toBe(COLOR);
        expect(decoded.debugMarkerData?.duration).toBe(1500n);
        expect(stream.feof()).toBe(true);
    });

    it('reads an absent optional as null and consumes the whole buffer', () => {
        const clear = Buffer.from([0xa4, 0x01, ...string(DebugRendererType.ClearDebugMarkers), 0x00]);
        const stream = new NetworkBinaryStream(clear);
        const decoded = new ClientboundDebugRendererPacket().deserialize(stream);

        expect(decoded.type).toBe(DebugRendererType.ClearDebugMarkers);
        expect(decoded.debugMarkerData).toBeNull();
        expect(stream.feof()).toBe(true);
    });
});
