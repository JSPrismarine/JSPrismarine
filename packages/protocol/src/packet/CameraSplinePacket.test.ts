import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CameraSplineDefinition from '../structure/CameraSplineDefinition';
import Vec3 from '../structure/Vec3';
import CameraSplinePacket from './CameraSplinePacket';

import type { CameraSplines } from './CameraSplinePacket';

const DATA: CameraSplines = {
    splines: [
        new CameraSplineDefinition(
            'ns:pan',
            1,
            undefined,
            [new Vec3(1, 2, 3)],
            [{ progress: 1, time: 1, easing: 'out_quad' }],
            []
        )
    ]
};

/** `DATA` on the wire, both header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xd2, 0x02], // packet id header, varuint32 338
    0x01, // Camera Data Splines count, a varuint32
    ...[0x06, ...Buffer.from('ns:pan', 'utf8')], // name "ns:pan"
    ...[0x00, 0x00, 0x80, 0x3f], // total_time 1, little-endian float
    0x00, // spline_type absent
    0x01, // control_points count
    ...[0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40], // position (1, 2, 3)
    0x01, // progress_key_frames count
    ...[0x00, 0x00, 0x80, 0x3f], // progress 1
    ...[0x00, 0x00, 0x80, 0x3f], // time 1
    0x01, // easing present
    ...[0x08, ...Buffer.from('out_quad', 'utf8')], // easing "out_quad"
    0x00 // rotation_key_frames count
]);

/** No splines: the header and a zero count. */
const EMPTY: CameraSplines = { splines: [] };

/** `EMPTY` on the wire. */
const EMPTY_BYTES = Buffer.from([0xd2, 0x02, 0x00]);

describe('CameraSplinePacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new CameraSplinePacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new CameraSplinePacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes no splines as a single zero byte after the header', () => {
        const buffer = new CameraSplinePacket(EMPTY).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...EMPTY_BYTES]);
    });

    it('reads no splines to the end of the buffer', () => {
        const stream = new NetworkBinaryStream(EMPTY_BYTES);
        const data = new CameraSplinePacket().deserialize(stream);

        expect(data).toEqual(EMPTY);
        expect(stream.feof()).toBe(true);
    });
});
