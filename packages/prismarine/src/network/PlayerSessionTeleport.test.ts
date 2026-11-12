import { describe, expect, it } from 'vitest';

import { Vector3 } from '@jsprismarine/math';
import type { Logger } from '@jsprismarine/logger';
import { PositionMode } from '@jsprismarine/protocol';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { sessionFor } from '../testing/playerSession.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { ChunkScheduler } from '../world/ChunkScheduler';
import type { ShownActor } from '../world/ShownActor';
import type ClientConnection from './ClientConnection';
import type { SessionPlayer } from './sessionPlayers';

/**
 * After a teleport the client keeps sending its old position until it applies the teleport, and
 * marks the first input from the new place `HandledTeleport`. The session ignores input positions
 * in between, so a stale one cannot move the player back on the server alone.
 */
describe('PlayerSession after a teleport', () => {
    const arrange = () => {
        let tick = 100;
        const at = { x: 0.5, y: 64, z: 0.5 };
        // The session's own player, as a move packet reads it.
        const mover = stub<ShownActor>({
            pitch: 0,
            yaw: 0,
            headYaw: 0,
            getRuntimeId: () => 1n,
            isOnGround: () => true,
            getPosition: () =>
                stub<ReturnType<ShownActor['getPosition']>>({ getX: () => at.x, getY: () => at.y, getZ: () => at.z })
        });
        const server = stub<Server>({
            getTick: () => tick,
            getLogger: () => stub<Logger>({ warn: () => {}, debug: () => {} }),
            getChunkScheduler: () => stub<ChunkScheduler>({ add: () => {}, remove: () => {} }),
            getConfig: () =>
                stub<Config>({
                    getProximityBroadcast: () => true,
                    getEntityTrackingHysteresis: () => 2,
                    getEntityTrackingInterval: () => 4,
                    getPacketCompressionLevel: () => 7
                })
        });
        const session = sessionFor(
            server,
            stub<ClientConnection>({ sendDataPacket: async () => {} }),
            stub<SessionPlayer>({}),
            { runtimeId: 1n }
        );
        const teleport = async (x: number, z: number) => {
            at.x = x;
            at.z = z;
            await session.sendMove(mover, PositionMode.Teleport);
        };
        return { session, mover, teleport, advance: (ticks: number) => void (tick += ticks) };
    };

    it('holds no position before any teleport', () => {
        const { session } = arrange();

        expect(session.holdsMovementForTeleport(new Vector3(9, 64, 9), false)).toBe(false);
    });

    it('holds the old position, and lets go on the input that handled the teleport', async () => {
        const { session, teleport } = arrange();
        await teleport(101.5, 101.5);

        // As a retail client was captured sending: the old place first, then the target, flagged.
        expect(session.holdsMovementForTeleport(new Vector3(0.5, 64, 0.5), false)).toBe(true);
        expect(session.holdsMovementForTeleport(new Vector3(101.5, 64, 101.5), true)).toBe(false);
        expect(session.holdsMovementForTeleport(new Vector3(102, 64, 101.5), false)).toBe(false);
    });

    it('does not let go on the acknowledgment of an earlier teleport', async () => {
        const { session, teleport } = arrange();
        await teleport(101.5, 101.5);
        await teleport(300.5, 300.5);

        expect(session.holdsMovementForTeleport(new Vector3(101.5, 64, 101.5), true)).toBe(true);
        expect(session.holdsMovementForTeleport(new Vector3(300.5, 64, 300.5), true)).toBe(false);
    });

    it('lets a client that never acknowledges move again after five seconds', async () => {
        const { session, teleport, advance } = arrange();
        await teleport(101.5, 101.5);

        advance(100);
        expect(session.holdsMovementForTeleport(new Vector3(101.5, 64, 101.5), false)).toBe(true);
        advance(1);
        expect(session.holdsMovementForTeleport(new Vector3(101.5, 64, 101.5), false)).toBe(false);
    });

    it('holds an input at the target that does not carry the flag', async () => {
        // Only the flag ends the hold before the timeout: a position alone cannot tell a client
        // that applied the teleport from one that walked to the same place.
        const { session, teleport } = arrange();
        await teleport(101.5, 101.5);

        expect(session.holdsMovementForTeleport(new Vector3(101.5, 64, 101.5), false)).toBe(true);
    });

    it('holds nothing after a move that is not a teleport', async () => {
        const { session, mover } = arrange();
        await session.sendMove(mover, PositionMode.Normal);

        expect(session.holdsMovementForTeleport(new Vector3(9, 64, 9), false)).toBe(false);
    });
});
