import { PlayerAuthInputData, PlayerAuthInputPacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { playerAuthInput } from './playerAuthInput';

const standing = { position: { x: 0.5, y: 65.62, z: 0.5 }, pitch: 0, yaw: 0, headYaw: 0 };

/** The packet as the server reads it: written to the wire and decoded again. */
const decoded = (packet: PlayerAuthInputPacket) => {
    const read = new PlayerAuthInputPacket(null, packet.encodeTransient());
    read.decode();
    const data = read.getPacketData();
    if (data === null) throw new Error('The input did not decode');
    return data;
};

describe('playerAuthInput', () => {
    it('reports a walk south while facing south as forward, holding the forward key', () => {
        const data = decoded(playerAuthInput(standing, { tick: 4n, walk: { x: 0, z: 0.21 } }));

        expect(data.tick).toBe(4n);
        expect(data.moveVector.x).toBeCloseTo(0);
        expect(data.moveVector.y).toBeCloseTo(1);
        expect([...data.inputData].sort()).toEqual(
            [PlayerAuthInputData.UP, PlayerAuthInputData.VERTICAL_COLLISION].sort()
        );
        expect(data.delta.getZ()).toBeCloseTo(0.21);
    });

    it('turns the walk into the frame of the yaw it reports', () => {
        // Facing west (yaw 90) and stepping south is a step to the left.
        const data = decoded(playerAuthInput({ ...standing, yaw: 90 }, { tick: 1n, walk: { x: 0, z: 0.21 } }));

        expect(data.moveVector.x).toBeCloseTo(1);
        expect(data.moveVector.y).toBeCloseTo(0);
        expect(data.inputData.has(PlayerAuthInputData.LEFT)).toBe(true);
    });

    it('stands still without a walk, on the ground, and flags a handled teleport when asked', () => {
        const data = decoded(playerAuthInput(standing, { tick: 9n, handledTeleport: true }));

        expect(data.moveVector).toEqual({ x: 0, y: 0 });
        expect(data.inputData).toEqual(
            new Set([PlayerAuthInputData.VERTICAL_COLLISION, PlayerAuthInputData.HANDLED_TELEPORT])
        );
        expect(data.position.getY()).toBeCloseTo(65.62, 4);
    });
});
