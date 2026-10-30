import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { layoutAt, spawnParticleEffectPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

/**
 * The bytes the hand-written encoder produced, recorded before the class moved to the
 * declarative layout, one case per alternative of `Molang Variables`. The detached case
 * carries actor -1, which is 0x01 as a ZigZag varint and ten bytes as a plain one, and a
 * negative y; the attached case carries an actor past 2^32 so a 32-bit read would truncate it.
 */
const CASES = [
    {
        branch: 'with no Molang variables',
        bytes: Buffer.from('02010000c0bf0020964300000000186d696e6563726166743a68656172745f7061727469636c6500', 'hex'),
        payload: {
            dimensionId: 2,
            actorId: -1n,
            position: new Vector3(-1.5, 300.25, 0),
            effectName: 'minecraft:heart_particle',
            molangVariables: null
        }
    },
    {
        branch: 'with Molang variables',
        bytes: Buffer.from(
            '00f2fdeee09092380000003f000080c2000480440c637573746f6d3a737061726b01107b227661726961626c652e78223a317d',
            'hex'
        ),
        payload: {
            dimensionId: 0,
            actorId: 123456789012345n,
            position: new Vector3(0.5, -64, 1024.125),
            effectName: 'custom:spark',
            molangVariables: '{"variable.x":1}'
        }
    }
];

describe('the declarative SpawnParticleEffect layout', () => {
    const layout = layoutAt(spawnParticleEffectPacket, 2193);

    for (const { branch, bytes, payload } of CASES) {
        it(`writes the bytes the hand-written encoder wrote ${branch}`, () => {
            const stream = new BinaryStream();
            layout.encode(stream, payload);

            expect(stream.getBuffer()).toEqual(bytes);
        });

        it(`reads those bytes back ${branch}`, () => {
            expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
        });
    }
});
