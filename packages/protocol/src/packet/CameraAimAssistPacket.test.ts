import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Vec2 from '../structure/Vec2';
import CameraAimAssistPacket, { CameraAimAssistAction, CameraAimAssistTargetMode } from './CameraAimAssistPacket';

import type { CameraAimAssist } from './CameraAimAssistPacket';

/** Turn the "ns:p" preset on, targeting by angle, with the debug volume drawn. */
const DATA: CameraAimAssist = {
    presetId: 'ns:p',
    viewAngle: new Vec2(30, 60),
    distance: 8,
    targetMode: CameraAimAssistTargetMode.ANGLE,
    action: CameraAimAssistAction.SET,
    showDebugRender: true
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xbc, 0x02], // packet id header: 316 as a varuint32
    ...[0x04, 0x6e, 0x73, 0x3a, 0x70], // Preset Id "ns:p"
    ...[0x00, 0x00, 0xf0, 0x41], // View Angle X 30.0, little-endian float
    ...[0x00, 0x00, 0x70, 0x42], // View Angle Y 60.0, little-endian float
    ...[0x00, 0x00, 0x00, 0x41], // Distance 8.0, little-endian float
    0x00, // Target Mode: Angle
    0x00, // Action: Set
    0x01 // Show Debug Render
]);

/** Clear aim assist: the client ignores the other fields, which still travel. */
const CLEAR: CameraAimAssist = {
    presetId: '',
    viewAngle: new Vec2(0, 0),
    distance: 1,
    targetMode: CameraAimAssistTargetMode.DISTANCE,
    action: CameraAimAssistAction.CLEAR,
    showDebugRender: false
};

/** `CLEAR` on the wire. */
const CLEAR_BYTES = Buffer.from([
    ...[0xbc, 0x02], // packet id header
    0x00, // Preset Id ""
    ...[0x00, 0x00, 0x00, 0x00], // View Angle X 0.0
    ...[0x00, 0x00, 0x00, 0x00], // View Angle Y 0.0
    ...[0x00, 0x00, 0x80, 0x3f], // Distance 1.0
    0x01, // Target Mode: Distance
    0x01, // Action: Clear
    0x00 // Show Debug Render
]);

describe('CameraAimAssistPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new CameraAimAssistPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new CameraAimAssistPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes a clear action with the distance mode', () => {
        const buffer = new CameraAimAssistPacket(CLEAR).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...CLEAR_BYTES]);
    });

    it('reads a clear action to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(CLEAR_BYTES);
        const data = new CameraAimAssistPacket().deserialize(stream);

        expect(data).toEqual(CLEAR);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips angles that need all 32 float bits', () => {
        const input: CameraAimAssist = { ...DATA, viewAngle: new Vec2(0.1, 12.3), distance: 15.9 };
        const buffer = new CameraAimAssistPacket(input).serialize(new NetworkBinaryStream());
        const data = new CameraAimAssistPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual({
            ...input,
            viewAngle: new Vec2(Math.fround(0.1), Math.fround(12.3)),
            distance: Math.fround(15.9)
        });
    });
});
