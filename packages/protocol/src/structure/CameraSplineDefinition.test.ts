import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraSplineDefinition, { CameraSplineType } from './CameraSplineDefinition';
import Vec3 from './Vec3';

/** Every field populated, the spline type present, one frame with easing and one without. */
const FULL = new CameraSplineDefinition(
    'ns:intro',
    2.5,
    CameraSplineType.Linear,
    [new Vec3(0, 1, 2), new Vec3(0.5, 0, 1)],
    [
        { progress: 0, time: 0 },
        { progress: 1, time: 2.5, easing: 'in_quad' }
    ],
    [{ rotation: new Vec3(0, 90, 0), time: 1, easing: 'linear' }]
);

/** `FULL` on the wire, written by hand in the order the docs list the fields. */
const FULL_BYTES = Buffer.from([
    ...[0x08, ...Buffer.from('ns:intro', 'utf8')], // name "ns:intro"
    ...[0x00, 0x00, 0x20, 0x40], // total_time 2.5, little-endian float
    0x01, // spline_type present
    ...[0x06, ...Buffer.from('linear', 'utf8')], // spline_type "linear"
    0x02, // control_points count, a varuint32
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40], // position (0, 1, 2)
    ...[0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f], // position (0.5, 0, 1)
    0x02, // progress_key_frames count
    ...[0x00, 0x00, 0x00, 0x00], // progress 0
    ...[0x00, 0x00, 0x00, 0x00], // time 0
    0x00, // easing absent
    ...[0x00, 0x00, 0x80, 0x3f], // progress 1
    ...[0x00, 0x00, 0x20, 0x40], // time 2.5
    0x01, // easing present
    ...[0x07, ...Buffer.from('in_quad', 'utf8')], // easing "in_quad"
    0x01, // rotation_key_frames count
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xb4, 0x42, 0x00, 0x00, 0x00, 0x00], // rotation (0, 90, 0)
    ...[0x00, 0x00, 0x80, 0x3f], // time 1
    0x01, // easing present
    ...[0x06, ...Buffer.from('linear', 'utf8')] // easing "linear"
]);

/** Only a name: the spline type absent and every list empty. */
const BARE = new CameraSplineDefinition('ns:x');

/** `BARE` on the wire. */
const BARE_BYTES = Buffer.from([
    ...[0x04, 0x6e, 0x73, 0x3a, 0x78], // name "ns:x"
    ...[0x00, 0x00, 0x00, 0x00], // total_time 0
    0x00, // spline_type absent
    0x00, // control_points count
    0x00, // progress_key_frames count
    0x00 // rotation_key_frames count
]);

describe('CameraSplineDefinition', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const stream = new NetworkBinaryStream();
        FULL.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...FULL_BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(FULL_BYTES);
        const definition = CameraSplineDefinition.deserialize(stream);

        expect(definition).toEqual(FULL);
        expect(definition.progressKeyFrames[0]).not.toHaveProperty('easing');
        expect(stream.feof()).toBe(true);
    });

    it('writes a definition with only a name as the name, a zero time and four zero bytes', () => {
        const stream = new NetworkBinaryStream();
        BARE.serialize(stream);

        expect([...stream.getBuffer()]).toEqual([...BARE_BYTES]);
    });

    it('reads an absent spline type as undefined', () => {
        const stream = new NetworkBinaryStream(BARE_BYTES);
        const definition = CameraSplineDefinition.deserialize(stream);

        expect(definition).toEqual(BARE);
        expect(definition.splineType).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });
});
