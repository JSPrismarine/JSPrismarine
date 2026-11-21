import CameraInstructionPacket from '@jsprismarine/protocol/bedrock/packet/CameraInstructionPacket';
import { describe, expect, it } from 'vitest';

import { splineInstructionOf } from './levelEntitySystems';

const hexOf = (spline: Parameters<typeof splineInstructionOf>[0]): string => {
    const packet = new CameraInstructionPacket({ cameraInstruction: { spline: splineInstructionOf(spline) } });
    packet.encode();
    return packet.getBuffer().toString('hex');
};

describe('splineInstructionOf', () => {
    it('writes a linear spline with no key frames as BDS 1.26.60.6 does', () => {
        expect(
            hexOf({
                kind: 'spline',
                type: 'linear',
                controlPoints: [
                    { x: 1, y: 2, z: 3 },
                    { x: 4, y: 5, z: 6 }
                ],
                totalTime: 2,
                progressKeyFrames: [],
                rotationKeyFrames: []
            })
        ).toBe('ac02000000000000010000004001020000803f0000004000004040000080400000a0400000c040000000000000');
    });

    it('writes a Catmull-Rom spline with eased key frames as BDS 1.26.60.6 does', () => {
        expect(
            hexOf({
                kind: 'spline',
                type: 'catmullRom',
                controlPoints: [
                    { x: 1, y: 2, z: 3 },
                    { x: 4, y: 5, z: 6 },
                    { x: 7, y: 8, z: 9 },
                    { x: 10, y: 11, z: 12 }
                ],
                totalTime: 4,
                progressKeyFrames: [
                    { value: 0, time: 0 },
                    { value: 1, time: 4, easing: 'InOutSine' }
                ],
                rotationKeyFrames: [
                    { value: { x: 10, y: 20, z: 30 }, time: 0 },
                    { value: { x: -5, y: 90, z: 0 }, time: 3, easing: 'OutBounce' }
                ]
            })
        ).toBe(
            'ac02000000000000010000804000040000803f0000004000004040000080400000a0400000c0400000e0400000004100001041000020410000304100004041020000000000000000066c696e6561720000803f000080400b696e5f6f75745f73696e6502000020410000a0410000f04100000000066c696e6561720000a0c00000b44200000000000040400a6f75745f626f756e636500000000'
        );
    });
});
