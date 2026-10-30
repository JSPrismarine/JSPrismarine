import { describe, expect, it } from 'vitest';
import { Vector3 } from '@jsprismarine/math';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { layoutAt } from '../wire/WireLayout';
import { movePlayerPacket } from '../wire/definitions/movement';
import MovePlayerPacket, { PositionMode } from './MovePlayerPacket';

import type { MovePlayer } from './MovePlayerPacket';

const normal: MovePlayer = {
    runtimeEntityId: 42n,
    position: { x: 1.5, y: 64.25, z: -3.75 },
    pitch: 12.5,
    yaw: -45,
    headYaw: 30,
    mode: PositionMode.Normal,
    onGround: true,
    ridingEntityRuntimeId: 9n,
    tick: 300n
};

const teleport: MovePlayer = {
    ...normal,
    mode: PositionMode.Teleport,
    teleportCause: 3,
    teleportItemId: 7
};

const layoutData = (data: MovePlayer) => ({
    runtimeEntityId: data.runtimeEntityId,
    position: new Vector3(data.position.x, data.position.y, data.position.z),
    pitch: data.pitch,
    yaw: data.yaw,
    headYaw: data.headYaw,
    mode: data.mode,
    onGround: data.onGround,
    ridingEntityRuntimeId: data.ridingEntityRuntimeId,
    teleportData:
        data.mode === PositionMode.Teleport
            ? { cause: data.teleportCause ?? 0, sourceActorType: data.teleportItemId ?? 0 }
            : null,
    tick: data.tick
});

const layoutBytes = (data: MovePlayer): Buffer => {
    const stream = new NetworkBinaryStream();
    layoutAt(movePlayerPacket, 2193).encode(stream, layoutData(data));
    return stream.getBuffer();
};

describe('the declarative MovePlayer layout', () => {
    it.each([
        ['a normal move', normal],
        ['a teleport', teleport]
    ])('matches the packet class for %s', (_name, data) => {
        const packetBytes = new MovePlayerPacket(data).serialize(new NetworkBinaryStream());
        const expectedPayload = layoutBytes(data);

        expect(packetBytes.subarray(1)).toEqual(expectedPayload);

        const stream = new NetworkBinaryStream(expectedPayload);
        expect(layoutAt(movePlayerPacket, 2193).decode(stream)).toEqual(layoutData(data));
        expect(stream.feof()).toBe(true);
    });
});
