import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientCameraAimAssistPacket, { ClientCameraAimAssistAction } from './ClientCameraAimAssistPacket';

import type { ClientCameraAimAssist } from './ClientCameraAimAssistPacket';

/** Turn aim assist on from the "ns:cam" camera preset. */
const DATA: ClientCameraAimAssist = {
    cameraPresetId: 'ns:cam',
    action: ClientCameraAimAssistAction.SET_FROM_CAMERA_PRESET,
    allowAimAssist: true
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xc1, 0x02], // packet id header: 321 as a varuint32
    ...[0x06, 0x6e, 0x73, 0x3a, 0x63, 0x61, 0x6d], // Camera Preset Id "ns:cam"
    0x00, // Action: SetFromCameraPreset
    0x01 // Allow aim assist
]);

/** Turn aim assist off with no preset named. */
const CLEAR: ClientCameraAimAssist = {
    cameraPresetId: '',
    action: ClientCameraAimAssistAction.CLEAR,
    allowAimAssist: false
};

/** `CLEAR` on the wire: the header, an empty string, the action, the flag. */
const CLEAR_BYTES = Buffer.from([
    ...[0xc1, 0x02], // packet id header
    0x00, // Camera Preset Id ""
    0x01, // Action: Clear
    0x00 // Allow aim assist
]);

describe('ClientCameraAimAssistPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ClientCameraAimAssistPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ClientCameraAimAssistPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes a clear action as three payload bytes', () => {
        const buffer = new ClientCameraAimAssistPacket(CLEAR).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...CLEAR_BYTES]);
    });

    it('reads a clear action to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(CLEAR_BYTES);
        const data = new ClientCameraAimAssistPacket().deserialize(stream);

        expect(data).toEqual(CLEAR);
        expect(stream.feof()).toBe(true);
    });
});
