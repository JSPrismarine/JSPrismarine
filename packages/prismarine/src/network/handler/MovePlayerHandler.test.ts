import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import MovePlayerPacket from '../packet/MovePlayerPacket';
import PositionMode from '../type/PositionMode';
import MovePlayerHandler from './MovePlayerHandler';

/**
 * At protocol 2193 `MovePlayerPacket` is client-bound. The bot harness still sends it, so
 * the handler reads it, but only on the docs' own terms for a server-bound one: the sender's
 * own runtime id, and a `Position Mode` of Normal or OnlyHeadRot. Everything else is dropped.
 */
const fake = () => {
    const dropped: string[] = [];
    const world = stub<World>({ getPlayers: () => [] });
    const player = stub<Player>({
        getName: () => 'tester',
        getRuntimeId: () => 7n,
        getPosition: () => new Position(0, 64, 0, world),
        getWorld: () => world,
        setPosition: vi.fn(async () => {}),
        setOnGround: vi.fn(async () => {})
    });
    const session = stub<PlayerSession>({
        getPlayer: () => player,
        sendMove: vi.fn(async () => {}),
        recordInputTick: vi.fn()
    });
    const server = stub<Server>({
        post: () => 0,
        getLogger: () => stub<Logger>({ debug: (...message: string[]) => void dropped.push(message.join(' ')) })
    });

    return { dropped, player, session, server };
};

const move = (configure: (packet: MovePlayerPacket) => void = () => {}): MovePlayerPacket => {
    const packet = new MovePlayerPacket();
    packet.runtimeEntityId = 7n;
    packet.position = new Vector3(3, 70, -4);
    packet.pitch = 5;
    packet.yaw = 90;
    packet.headYaw = 85;
    packet.mode = PositionMode.Normal;
    packet.onGround = true;
    packet.ridingEntityRuntimeId = 0n;
    packet.tick = 300n;
    configure(packet);
    return packet;
};

describe('MovePlayerHandler', () => {
    it('moves the player for a normal move of their own runtime id', async () => {
        const { dropped, player, session, server } = fake();

        await new MovePlayerHandler().handle(move(), server, session);

        expect(player.setPosition).toHaveBeenCalledWith(
            { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
            false
        );
        expect(player.setOnGround).toHaveBeenCalledWith(true);
        expect(dropped).toEqual([]);
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

        expect(player.setPosition).toHaveBeenCalled();
    });

    it('records the packet tick as the input tick before the move is applied', async () => {
        // So a reset sent for this very move carries the tick the client can rewind to.
        const order: string[] = [];
        const { player, session, server } = fake();
        session.recordInputTick = vi.fn(() => void order.push('tick'));
        player.setPosition = vi.fn(async () => void order.push('move'));

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

        expect(player.setPosition).not.toHaveBeenCalled();
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

        expect(player.setPosition).not.toHaveBeenCalled();
        expect(dropped).toHaveLength(1);
    });
});
