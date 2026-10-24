import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { EasingType } from '../structure/CameraInstruction';
import Vec2 from '../structure/Vec2';
import Vec3 from '../structure/Vec3';
import CameraInstructionPacket from './CameraInstructionPacket';

import type { CameraInstructionPayload } from './CameraInstructionPacket';

/** Every part present, and every optional inside each part present. */
const FULL: CameraInstructionPayload = {
    cameraInstruction: {
        set: {
            preset: 3,
            ease: { type: EasingType.IN_OUT_QUAD, time: 2 },
            position: new Vec3(1, 2, 3),
            rotation: new Vec2(45, 90),
            facing: new Vec3(0, 1, 0),
            viewOffset: new Vec2(0.5, 1.5),
            entityOffset: new Vec3(0, 0.5, 0),
            default: true,
            removeIgnoreStartingValuesComponent: false
        },
        clear: false,
        fade: {
            time: { fadeInTime: 0.5, holdTime: 1, fadeOutTime: 2 },
            color: { red: 1, green: 0.5, blue: 0 }
        },
        target: { targetCenterOffset: new Vec3(0, 1, 0), targetActorId: 0x0102030405060708n },
        removeTarget: true,
        fieldOfView: { fieldOfView: 70, easeTime: 1, easeType: 'in_out_sine', clear: false },
        spline: {
            totalTime: 10,
            type: 1,
            curve: [new Vec3(0, 0, 0), new Vec3(1, 2, 3)],
            progressKeyFrames: [{ value: 0.5, time: 5, easing: 'linear' }],
            rotationKeyFrames: [{ value: new Vec3(0, 90, 0), time: 10, easing: 'spring' }],
            splineIdentifier: 'arc',
            loadFromJson: false
        },
        attachToEntity: -1n,
        detachFromEntity: true
    }
};

/** `FULL` on the wire, header included, written by hand in the order the docs list the fields. */
const FULL_BYTES = Buffer.from([
    ...[0xac, 0x02], // packet id 300 as a varuint32 header
    0x01, // Set present
    ...[0x03, 0x00, 0x00, 0x00], // preset 3, uint32 LE
    ...[0x01, 0x04, 0x00, 0x00, 0x00, 0x40], // ease present: type in_out_quad, time float LE 2.0
    ...[0x01, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40], // pos present, Vec3 (1, 2, 3)
    ...[0x01, 0x00, 0x00, 0x34, 0x42, 0x00, 0x00, 0xb4, 0x42], // rot present, (45, 90)
    ...[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x00], // facing present, Vec3 (0, 1, 0)
    ...[0x01, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xc0, 0x3f], // view_offset present, (0.5, 1.5)
    ...[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x00, 0x00], // entity_offset present, (0, 0.5, 0)
    ...[0x01, 0x01], // default present, true
    0x00, // removeIgnoreStartingValuesComponent, no presence byte
    ...[0x01, 0x00], // Clear present, false
    0x01, // Fade present
    ...[0x01, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40], // Time present: Fade In 0.5, Hold 1.0, Fade Out 2.0
    ...[0x01, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x00, 0x00], // Color present: Red 1.0, Green 0.5, Blue 0.0
    0x01, // Target present
    ...[0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x00], // Target Center Offset present, Vec3 (0, 1, 0)
    ...[0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01], // Target Actor ID, int64 LE, no presence byte
    ...[0x01, 0x01], // RemoveTarget present, true
    0x01, // FieldOfView present
    ...[0x00, 0x00, 0x8c, 0x42], // Field of View, float LE 70.0
    ...[0x00, 0x00, 0x80, 0x3f], // FOV Ease Time, 1.0
    ...[0x0b, ...Buffer.from('in_out_sine', 'utf8')], // FOV Ease Type as a string, 11 bytes
    0x00, // Field of View Clear
    0x01, // Spline present
    ...[0x00, 0x00, 0x20, 0x41], // totalTime, 10.0
    0x01, // type
    0x02, // curve count, a varuint32
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // curve[0], Vec3 (0, 0, 0)
    ...[0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40], // curve[1], Vec3 (1, 2, 3)
    0x01, // progressKeyFrames count
    ...[0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xa0, 0x40], // Key frame value 0.5, Key frame time 5.0
    ...[0x06, ...Buffer.from('linear', 'utf8')], // Key frame easing func as a string
    0x01, // rotationOption count
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb4, 0x42, 0x00, 0x00, 0x00, 0x00], // Key frame value, Vec3 (0, 90, 0)
    ...[0x00, 0x00, 0x20, 0x41], // Key frame time 10.0
    ...[0x06, ...Buffer.from('spring', 'utf8')], // Key frame easing func as a string
    ...[0x01, 0x03, 0x61, 0x72, 0x63], // splineIdentifier present, "arc"
    ...[0x01, 0x00], // loadFromJson present, false
    ...[0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], // AttachToEntity present, Entity Actor ID int64 LE -1
    ...[0x01, 0x01] // DetachFromEntity present, true
]);

/** No part present: the header, then nine 0 presence bytes. */
const EMPTY: CameraInstructionPayload = { cameraInstruction: {} };

/** `EMPTY` on the wire. */
const EMPTY_BYTES = Buffer.from([
    ...[0xac, 0x02], // packet id 300 as a varuint32 header
    0x00, // Set absent
    0x00, // Clear absent
    0x00, // Fade absent
    0x00, // Target absent
    0x00, // RemoveTarget absent
    0x00, // FieldOfView absent
    0x00, // Spline absent
    0x00, // AttachToEntity absent
    0x00 // DetachFromEntity absent
]);

describe('CameraInstructionPacket', () => {
    it('writes every part and inner optional in the order protocol 2193 defines', () => {
        const buffer = new CameraInstructionPacket(FULL).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...FULL_BYTES]);
    });

    it('writes nine zero bytes after the header when no part is set', () => {
        const buffer = new CameraInstructionPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads a hand-built buffer with every part to its end', () => {
        const stream = new NetworkBinaryStream(FULL_BYTES);
        const data = new CameraInstructionPacket().deserialize(stream);

        expect(data).toEqual(FULL);
        expect(stream.feof()).toBe(true);
    });

    it('reads a hand-built buffer with no part to its end', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new CameraInstructionPacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });
});
