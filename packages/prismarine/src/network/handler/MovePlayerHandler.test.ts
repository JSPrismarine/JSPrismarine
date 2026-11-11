import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';

import type { MovePlayer } from '@jsprismarine/protocol/packet/MovePlayerPacket';
import MovePlayerHandler, { applyClientMovement } from './MovePlayerHandler';

/**
 * At protocol 2193 `MovePlayerPacket` is client-bound. The bot harness still sends it, so
 * the handler reads it, but only on the docs' own terms for a server-bound one: the sender's
 * own runtime id, and a `Position Mode` of Normal or OnlyHeadRot. Everything else is dropped.
 */
const fake = () => {
    const dropped: string[] = [];
    const players: ReturnType<World['getPlayers']> = [];
    const world = stub<World>({
        getPlayers: () => players,
        entityRelocated: () => {},
        broadcastMove: vi.fn(async () => {})
    });
    const player = stubPlayerPort({
        getName: () => 'tester',
        getRuntimeId: () => 7n,
        getPosition: () => new Position(0, 64, 0, world),
        getWorld: () => world,
        isOnGround: () => false,
        setPlayerPosition: vi.fn(async () => {}),
        setOnGround: vi.fn(async () => {})
    });
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('tester'),
        getPlayer: () => player,
        sendMove: vi.fn(async () => {}),
        recordInputTick: vi.fn(),
        holdsMovementForTeleport: () => false
    });
    const server = stub<Server>({
        post: () => 0,
        getLogger: () => stub<Logger>({ debug: (...message: string[]) => void dropped.push(message.join(' ')) })
    });

    return { dropped, player, players, session, server };
};

const move = (configure: (data: MovePlayer) => void = () => {}): MovePlayerPacket => {
    const data: MovePlayer = {
        runtimeEntityId: 7n,
        position: { x: 3, y: 70, z: -4 },
        pitch: 5,
        yaw: 90,
        headYaw: 85,
        mode: PositionMode.Normal,
        onGround: true,
        ridingEntityRuntimeId: 0n,
        tick: 300n
    };
    configure(data);
    return new MovePlayerPacket(data);
};

describe('MovePlayerHandler', () => {
    it('keeps posting movement events but queues movement only for changed poses', async () => {
        const world = stub<World>({
            getPlayers: () => [],
            entityRelocated: () => {},
            broadcastMove: vi.fn(async () => {})
        });
        const pose = {
            position: new Position(0, 64, 0, world),
            pitch: 0,
            yaw: 0,
            headYaw: 0,
            onGround: false
        };
        const player = stubPlayerPort({
            getName: () => 'tester',
            getRuntimeId: () => 7n,
            getPosition: () => pose.position,
            pitch: pose.pitch,
            yaw: pose.yaw,
            headYaw: pose.headYaw,
            isOnGround: () => pose.onGround,
            getWorld: () => world,
            setPlayerPosition: vi.fn(async ({ position, pitch, yaw, headYaw }) => {
                pose.position = new Position(position.getX(), position.getY(), position.getZ(), world);
                pose.pitch = pitch;
                pose.yaw = yaw;
                pose.headYaw = headYaw;
                await world.broadcastMove(player.getBody());
            }),
            setOnGround: vi.fn(async (onGround: boolean) => void (pose.onGround = onGround))
        });
        Object.defineProperties(player, {
            pitch: { get: () => pose.pitch },
            yaw: { get: () => pose.yaw },
            headYaw: { get: () => pose.headYaw }
        });
        const session = stub<PlayerSession>({
            runtimeId: 7n,
            identity: identityNamed('tester'),
            getPlayer: () => player,
            holdsMovementForTeleport: () => false
        });
        let events = 0;
        const server = stub<Server>({ post: () => ++events });
        const movement = {
            position: new Vector3(3, 70, -4),
            pitch: 5,
            yaw: 90,
            headYaw: 85,
            onGround: true
        };

        await applyClientMovement(server, session, movement);
        await applyClientMovement(server, session, movement);
        await applyClientMovement(server, session, { ...movement, yaw: 91 });
        await applyClientMovement(server, session, { ...movement, yaw: 91, onGround: false });

        expect(events).toBe(4);
        expect(player.setPlayerPosition).toHaveBeenCalledTimes(2);
        expect(player.setOnGround).toHaveBeenCalledTimes(2);
        // Position plus landing queues twice; the tick replicator coalesces both into the final pose.
        expect(world.broadcastMove).toHaveBeenCalledTimes(4);
    });

    it('moves the player for a normal move of their own runtime id', async () => {
        const { dropped, player, session, server } = fake();

        await new MovePlayerHandler().handle(move(), server, session);

        expect(player.setPlayerPosition).toHaveBeenCalledWith(
            { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
            false
        );
        expect(player.setOnGround).toHaveBeenCalledWith(true);
        expect(dropped).toEqual([]);
    });

    it('drops a move the session says was sent before an unacknowledged teleport', async () => {
        const { dropped, player, session, server } = fake();
        session.holdsMovementForTeleport = vi.fn(() => true);
        let events = 0;
        server.post = () => ++events;

        await new MovePlayerHandler().handle(move(), server, session);

        expect(session.holdsMovementForTeleport).toHaveBeenCalledWith(new Vector3(3, 70, -4), false);
        expect(player.setPlayerPosition).not.toHaveBeenCalled();
        expect(events).toBe(0);
        expect(dropped).toHaveLength(1);
        expect(dropped[0]).toContain('Dropped a position from tester sent before its teleport');
    });

    it('does not send a second MovePlayer update to observers', async () => {
        const { player, players, session, server } = fake();
        const sendMove = vi.fn(async () => {});
        const observer = stubPlayerPort({
            getNetworkSession: () =>
                stub<PlayerSession>({
                    tracks: () => true,
                    sendMove
                })
        });
        players.push(player, observer);

        await new MovePlayerHandler().handle(move(), server, session);

        expect(sendMove).not.toHaveBeenCalled();
    });

    it('accepts the head-only mode the docs allow for a player in a vehicle', async () => {
        const { player, session, server } = fake();

        await new MovePlayerHandler().handle(
            move((packet) => {
                packet.mode = PositionMode.OnlyHeadRot;
            }),
            server,
            session
        );

        expect(player.setPlayerPosition).toHaveBeenCalled();
    });

    it('records the packet tick as the input tick before the move is applied', async () => {
        // So a reset sent for this very move carries the tick the client can rewind to.
        const order: string[] = [];
        const { player, session, server } = fake();
        session.recordInputTick = vi.fn(() => void order.push('tick'));
        player.setPlayerPosition = vi.fn(async () => void order.push('move'));

        await new MovePlayerHandler().handle(move(), server, session);

        expect(session.recordInputTick).toHaveBeenCalledWith(300n);
        expect(order).toEqual(['tick', 'move']);
    });

    it('drops a move for another runtime id', async () => {
        // "If server-bound, this is always the id of the sending player."
        const { dropped, player, session, server } = fake();

        await new MovePlayerHandler().handle(
            move((packet) => {
                packet.runtimeEntityId = 8n;
            }),
            server,
            session
        );

        expect(player.setPlayerPosition).not.toHaveBeenCalled();
        expect(session.recordInputTick).not.toHaveBeenCalled();
        expect(dropped).toHaveLength(1);
    });

    it.each([PositionMode.Teleport, PositionMode.Respawn])('drops a move in server-only mode %i', async (mode) => {
        // Respawn and Teleport are the server's modes. A client sending one is asking to be
        // put somewhere without walking there, and its Teleport Data is never read.
        const { dropped, player, session, server } = fake();

        await new MovePlayerHandler().handle(
            move((packet) => {
                packet.mode = mode;
                packet.teleportCause = 1;
                packet.teleportItemId = 1;
            }),
            server,
            session
        );

        expect(player.setPlayerPosition).not.toHaveBeenCalled();
        expect(dropped).toHaveLength(1);
    });
});
