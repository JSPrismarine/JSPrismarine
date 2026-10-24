import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import ClientboundDebugRendererPacket, { DebugRendererType } from './ClientboundDebugRendererPacket';

// Packet id 164 as a varuint.
const HEADER = [0xa4, 0x01];

const string = (value: string): number[] => [Buffer.byteLength(value), ...Buffer.from(value, 'utf8')];

const f32 = (value: number): number[] => {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value);
    return [...buffer];
};

// Opaque red as ARGB, which reaches the wire as B, G, R, A.
const COLOR = 0xffff0000 | 0;

const ADD_CUBE = [
    ...string('adddebugmarkercube'),
    0x01, // DebugMarkerData present
    ...string('mark'),
    ...f32(1.5),
    ...f32(64),
    ...f32(-2.5),
    0x00,
    0x00,
    0xff,
    0xff, // Color
    0xdc,
    0x05,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00 // duration 1500 ms as a uint64 little-endian
];

describe('ClientboundDebugRendererPacket', () => {
    it('writes a clear as the type string and an empty optional', () => {
        const packet = new ClientboundDebugRendererPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...string('cleardebugmarkers'), 0x00]));
    });

    it('writes the marker data behind the presence byte', () => {
        const packet = new ClientboundDebugRendererPacket();
        packet.type = DebugRendererType.AddDebugMarkerCube;
        packet.debugMarkerData = {
            text: 'mark',
            position: new Vector3(1.5, 64, -2.5),
            color: COLOR,
            duration: 1500n
        };
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...ADD_CUBE]));
    });

    it('reads the marker data and consumes the whole buffer', () => {
        const packet = new ClientboundDebugRendererPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...ADD_CUBE]));
        packet.decode();

        expect(packet.type).toBe(DebugRendererType.AddDebugMarkerCube);
        expect(packet.debugMarkerData?.text).toBe('mark');
        expect(packet.debugMarkerData?.position.getY()).toBe(64);
        expect(packet.debugMarkerData?.color).toBe(COLOR);
        expect(packet.debugMarkerData?.duration).toBe(1500n);
        expect(packet.feof()).toBe(true);
    });

    it('reads an absent optional as null and consumes the whole buffer', () => {
        const packet = new ClientboundDebugRendererPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...string('cleardebugmarkers'), 0x00]));
        packet.decode();

        expect(packet.type).toBe(DebugRendererType.ClearDebugMarkers);
        expect(packet.debugMarkerData).toBeNull();
        expect(packet.feof()).toBe(true);
    });
});
