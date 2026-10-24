import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import ClientboundDebugRendererPacket, { DebugRendererType } from './ClientboundDebugRendererPacket';

// Header: id 164 is 0xa4 0x01.
const HEADER = [0xa4, 0x01];
const str = (value: string): number[] => [value.length, ...Buffer.from(value, 'ascii')];

describe('ClientboundDebugRendererPacket', () => {
    it('encodes a clear as the type string and an absent marker', () => {
        const packet = new ClientboundDebugRendererPacket();
        packet.type = DebugRendererType.ClearDebugMarkers;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...str('cleardebugmarkers'), 0x00]));
    });

    it('decodes a cube with its text, position, color and duration, consuming the whole buffer', () => {
        const encoded = Buffer.from([
            ...HEADER,
            ...str('adddebugmarkercube'),
            0x01, // marker present
            ...str('a'),
            0x00,
            0x00,
            0x80,
            0x3f, // x 1.0f
            0x00,
            0x00,
            0x00,
            0x40, // y 2.0f
            0x00,
            0x00,
            0x40,
            0x40, // z 3.0f
            0x33,
            0x22,
            0x11,
            0x7f, // ARGB 0x7f112233 as int32 LE
            0xe8,
            0x03,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00 // 1000 ms as uint64 LE
        ]);
        const packet = new ClientboundDebugRendererPacket(encoded);
        packet.decode();

        expect(packet.type).toBe(DebugRendererType.AddDebugMarkerCube);
        expect(packet.debugMarkerData).toEqual({
            text: 'a',
            position: new Vector3(1, 2, 3),
            color: 0x7f112233,
            duration: 1000n
        });
        expect(packet.feof()).toBe(true);
    });

    it('round-trips a cube', () => {
        const packet = new ClientboundDebugRendererPacket();
        packet.type = DebugRendererType.AddDebugMarkerCube;
        packet.debugMarkerData = { text: 'a', position: new Vector3(1, 2, 3), color: 0x7f112233, duration: 1000n };
        packet.encode();

        const decoded = new ClientboundDebugRendererPacket(packet.getBuffer());
        decoded.decode();

        expect(decoded.debugMarkerData).toEqual(packet.debugMarkerData);
        expect(decoded.feof()).toBe(true);
    });
});
