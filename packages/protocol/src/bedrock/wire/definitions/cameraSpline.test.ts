import BinaryStream from '@jsprismarine/binaryutils';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { layoutAt } from '../../../wire/WireLayout';
import { cameraSplinePacket } from './cameraSpline';

import type { CameraSplinePayload } from './cameraSpline';

const payload: CameraSplinePayload = {
    splines: [
        {
            name: 'ns:pan',
            totalTime: 2.5,
            splineType: 'linear',
            controlPoints: [
                { x: 1, y: 2, z: 3 },
                { x: 4, y: 5, z: 6 }
            ],
            progressKeyFrames: [
                { progress: 0, time: 0, easing: null },
                { progress: 1, time: 2.5, easing: 'out_quad' }
            ],
            rotationKeyFrames: [{ rotation: { x: 0, y: 90, z: 0 }, time: 1, easing: 'in_sine' }]
        },
        {
            name: 'ns:still',
            totalTime: 1,
            splineType: 'catmullrom',
            controlPoints: [],
            progressKeyFrames: [],
            rotationKeyFrames: []
        }
    ]
};

const VERSIONS = [2193, 2225] as const;

/** Writes `value` as a string: a varuint32 byte length, then UTF-8. */
const str = (value: string): number[] => [value.length, ...Buffer.from(value, 'utf8')];

describe('the declarative CameraSpline layout', () => {
    for (const version of VERSIONS) {
        describe(`at protocol ${version}`, () => {
            it('writes the fields in the order the docs list them', () => {
                const stream = new BinaryStream();
                layoutAt(cameraSplinePacket, version).encode(stream, {
                    splines: [
                        {
                            name: 'a:b',
                            totalTime: 1,
                            splineType: 'linear',
                            controlPoints: [{ x: 1, y: 2, z: 3 }],
                            progressKeyFrames: [{ progress: 1, time: 1, easing: 'spring' }],
                            rotationKeyFrames: [{ rotation: { x: 1, y: 2, z: 3 }, time: 1, easing: null }]
                        }
                    ]
                });

                expect([...stream.getBuffer()]).toEqual([
                    0x01, // Camera Data Splines count
                    ...str('a:b'), // name
                    ...[0x00, 0x00, 0x80, 0x3f], // total_time 1
                    ...str('linear'), // spline_type, a bare string with no presence byte
                    0x01, // control_points count
                    ...[0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40], // position
                    0x01, // progress_key_frames count
                    ...[0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f], // progress 1, time 1
                    0x01, // easing present
                    ...str('spring'),
                    0x01, // rotation_key_frames count
                    ...[0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x40, 0x40], // rotation
                    ...[0x00, 0x00, 0x80, 0x3f], // time 1
                    0x00 // easing absent
                ]);
            });

            it('reads every field back and consumes the whole payload', () => {
                const stream = new BinaryStream();
                layoutAt(cameraSplinePacket, version).encode(stream, payload);
                const read = new BinaryStream(stream.getBuffer());

                expect(layoutAt(cameraSplinePacket, version).decode(read)).toEqual(payload);
                expect(read.feof()).toBe(true);
            });

            it('writes no splines as a single zero byte', () => {
                const stream = new BinaryStream();
                layoutAt(cameraSplinePacket, version).encode(stream, { splines: [] });

                expect([...stream.getBuffer()]).toEqual([0]);
            });

            it('rejects an easing name outside the easing_function enum on decode', () => {
                const bytes = Buffer.from([
                    0x01,
                    ...str('a:b'),
                    ...[0x00, 0x00, 0x80, 0x3f],
                    ...str('linear'),
                    0x00, // control_points
                    0x01, // progress_key_frames
                    ...[0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f],
                    0x01,
                    ...str('wobble'),
                    0x00
                ]);

                expect(() => layoutAt(cameraSplinePacket, version).decode(new BinaryStream(bytes))).toThrow(
                    'Unknown easing_function "wobble"'
                );
            });

            it('round-trips the real BDS capture of the packet byte for byte', () => {
                const directory = version === 2193 ? 'v2193' : 'v2225';
                const captured = readFileSync(
                    new URL(`../../../../../bedrock-data/src/jsp/${directory}/wire/0x152.bin`, import.meta.url)
                );
                const layout = layoutAt(cameraSplinePacket, version);
                const read = new BinaryStream(captured);
                const decoded = layout.decode(read);
                const stream = new BinaryStream();
                layout.encode(stream, decoded);

                expect(read.feof()).toBe(true);
                expect(Buffer.from(stream.getBuffer())).toEqual(captured);
            });
        });
    }
});
