import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../../NetworkBinaryStream';
import CameraSplinePacket from '../../packet/CameraSplinePacket';
import CameraSplineDefinition from '../../structure/CameraSplineDefinition';
import Vec3 from '../../structure/Vec3';
import { layoutAt } from '../WireLayout';
import { cameraSplinePacket } from './cameraSpline';

import type { CameraSplinePayload } from './cameraSpline';

/** A serialized packet without its id header, which is what the layout describes. */
const bodyOf = (buffer: Buffer): Buffer => {
    const stream = new BinaryStream(buffer);
    stream.readUnsignedVarInt();
    return stream.readRemaining();
};

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
            splineType: null,
            controlPoints: [],
            progressKeyFrames: [],
            rotationKeyFrames: []
        }
    ]
};

describe('the declarative CameraSpline layout', () => {
    it('writes the bytes the packet class writes', () => {
        const classPacket = new CameraSplinePacket({
            splines: [
                new CameraSplineDefinition(
                    'ns:pan',
                    2.5,
                    'linear',
                    [new Vec3(1, 2, 3), new Vec3(4, 5, 6)],
                    [
                        { progress: 0, time: 0 },
                        { progress: 1, time: 2.5, easing: 'out_quad' }
                    ],
                    [{ rotation: new Vec3(0, 90, 0), time: 1, easing: 'in_sine' }]
                ),
                new CameraSplineDefinition('ns:still', 1)
            ]
        });
        const stream = new BinaryStream();
        layoutAt(cameraSplinePacket, 2193).encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bodyOf(classPacket.serialize(new NetworkBinaryStream())));
    });

    it('reads every field back and consumes the whole payload', () => {
        const stream = new BinaryStream();
        layoutAt(cameraSplinePacket, 2225).encode(stream, payload);
        const read = new BinaryStream(stream.getBuffer());

        expect(layoutAt(cameraSplinePacket, 2225).decode(read)).toEqual(payload);
        expect(read.feof()).toBe(true);
    });

    it('writes no splines as a single zero byte', () => {
        const stream = new BinaryStream();
        layoutAt(cameraSplinePacket, 2193).encode(stream, { splines: [] });

        expect([...stream.getBuffer()]).toEqual([0]);
    });
});
