import type { Logger } from '@jsprismarine/logger';
import { PositionMode } from '@jsprismarine/protocol';
import MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import { describe, expect, it, vi } from 'vitest';

import { sessionContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import MovePlayerHandler from './MovePlayerHandler';

/**
 * A client's `MovePlayerPacket` moved a player only in the movement mode protocol 818 removed,
 * so the server reads it and drops it. A session double that records every write shows none.
 */
const fake = () => {
    const dropped: string[] = [];
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('tester'),
        setPlayerPosition: vi.fn(async () => {}),
        setOnGround: vi.fn(),
        sendMove: vi.fn(async () => {}),
        recordInputTick: vi.fn(),
        holdsMovementForTeleport: vi.fn(() => false)
    });
    const log = stub<Logger>({ debug: (...message: string[]) => void dropped.push(message.join(' ')) });

    return { dropped, session, log };
};

const move = (mode: PositionMode): MovePlayerPacket =>
    new MovePlayerPacket({
        runtimeEntityId: 7n,
        position: { x: 3, y: 70, z: -4 },
        pitch: 5,
        yaw: 90,
        headYaw: 85,
        mode,
        onGround: true,
        ridingEntityRuntimeId: 0n,
        tick: 300n
    });

describe('MovePlayerHandler', () => {
    it.each([PositionMode.Normal, PositionMode.OnlyHeadRot, PositionMode.Teleport, PositionMode.Respawn])(
        'does not move the player for a client MovePlayer in mode %i',
        async (mode) => {
            const { dropped, session, log } = fake();

            await new MovePlayerHandler().handle(move(mode), sessionContext(session, { log }));

            expect(session.setPlayerPosition).not.toHaveBeenCalled();
            expect(session.setOnGround).not.toHaveBeenCalled();
            expect(session.sendMove).not.toHaveBeenCalled();
            expect(session.recordInputTick).not.toHaveBeenCalled();
            expect(session.holdsMovementForTeleport).not.toHaveBeenCalled();
            expect(dropped).toEqual([
                'Dropped a MovePlayer from tester: clients move with PlayerAuthInput MovePlayerHandler/handle'
            ]);
        }
    );

    it('runs in the connection lane, since it writes nothing', () => {
        expect(new MovePlayerHandler().lane).toBe('connection');
    });
});
