import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraAimAssistActorPriorityPacket from './CameraAimAssistActorPriorityPacket';

import type { CameraAimAssistActorPriority } from './CameraAimAssistActorPriorityPacket';

/** Two overrides, the second with a negative priority. */
const DATA: CameraAimAssistActorPriority = {
    priorities: [
        { presetIndex: 0, categoryIndex: 1, actorIndex: 2, priorityValue: 100 },
        { presetIndex: 3, categoryIndex: 4, actorIndex: 300, priorityValue: -1 }
    ]
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xd3, 0x02], // packet id header: 339 as a varuint32
    0x02, // Camera Aim-Assist Actor Priority List count, a varuint32
    ...[0x00, 0x00, 0x00, 0x00], // Preset Index 0, little-endian int32
    ...[0x01, 0x00, 0x00, 0x00], // Category Index 1
    ...[0x02, 0x00, 0x00, 0x00], // Actor Index 2
    ...[0x64, 0x00, 0x00, 0x00], // Priority Value 100
    ...[0x03, 0x00, 0x00, 0x00], // Preset Index 3
    ...[0x04, 0x00, 0x00, 0x00], // Category Index 4
    ...[0x2c, 0x01, 0x00, 0x00], // Actor Index 300
    ...[0xff, 0xff, 0xff, 0xff] // Priority Value -1
]);

/** No overrides: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([
    ...[0xd3, 0x02], // packet id header
    0x00 // Camera Aim-Assist Actor Priority List count
]);

describe('CameraAimAssistActorPriorityPacket', () => {
    it('writes every entry as four little-endian int32s', () => {
        const buffer = new CameraAimAssistActorPriorityPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new CameraAimAssistActorPriorityPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty list as one payload byte', () => {
        const buffer = new CameraAimAssistActorPriorityPacket({ priorities: [] }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty list to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new CameraAimAssistActorPriorityPacket().deserialize(stream);

        expect(data).toEqual({ priorities: [] });
        expect(stream.feof()).toBe(true);
    });
});
