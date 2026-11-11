import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import type { StorePlayer } from '../../entity/storePlayer';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import type { HandlerServices } from './HandlerContext';
import MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';

import type { MovePlayer } from '@jsprismarine/protocol/packet/MovePlayerPacket';
import MovePlayerHandler, { applyClientMovement } from './MovePlayerHandler';
import type { ShownActor } from '../../world/ShownActor';
import type { ShownPlayer } from '../../world/ShownPlayer';

/**
 * At protocol 2193 `MovePlayerPacket` is client-bound. The bot harness still sends it, so
 * the handler reads it, but only on the docs' own terms for a server-bound one: the sender's
 * own runtime id, and a `Position Mode` of Normal or OnlyHeadRot. Everything else is dropped.
 */
const fake = () => {
    const dropped: string[] = [];
    const players: PlayerSession[] = [];
    const world = stub<World>({
        getViewers: () => players,
        broadcastMove: vi.fn(async () => {})
    });
    const position = new Position(0, 64, 0, world);
    const player = stubPlayerPort({ getPosition: () => position, isOnGround: () => false });
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('tester'),
        getPlayer: () => player,
        getWorld: () => world,
        // The move event reads where the player was from the session.
        getViewPosition: () => position,
        shown: () => stub<ShownPlayer>({}),
        setPlayerPosition: vi.fn(async () => {}),
        setOnGround: vi.fn(),
        sendMove: vi.fn(async () => {}),
        recordInputTick: vi.fn(),
        holdsMovementForTeleport: () => false
    });
    const events = stub<HandlerServices['events']>({ post: () => 0 });
    const log = stub<Logger>({ debug: (...message: string[]) => void dropped.push(message.join(' ')) });

    return { dropped, player, players, session, events, log };
};

/** Applies one packet as the input step does: the handler, then the sends it handed over. */
const handle = async (packet: MovePlayerPacket, { session, events, log }: ReturnType<typeof fake>): Promise<void> => {
    const { context, settled } = inputContext(session, { log, services: { events } });
    new MovePlayerHandler().handle(packet, context);
    await settled();
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
            getViewers: () => [],
            broadcastMove: vi.fn(async () => {})
        });
        const pose = {
            position: new Position(0, 64, 0, world),
            pitch: 0,
            yaw: 0,
            headYaw: 0,
            onGround: false
        };
        const store = stub<StorePlayer>({ getPosition: () => pose.position, isOnGround: () => pose.onGround });
        Object.defineProperties(store, {
            pitch: { get: () => pose.pitch },
            yaw: { get: () => pose.yaw },
            headYaw: { get: () => pose.headYaw }
        });
        const actor = stub<ShownActor>({});
        const session = stub<PlayerSession>({
            runtimeId: 7n,
            identity: identityNamed('tester'),
            getPlayer: () => store,
            getWorld: () => world,
            getViewPosition: () => pose.position,
            shown: () => stub<ShownPlayer>({}),
            setPlayerPosition: vi.fn(async ({ position, pitch, yaw, headYaw }) => {
                pose.position = new Position(position.getX(), position.getY(), position.getZ(), world);
                pose.pitch = pitch ?? pose.pitch;
                pose.yaw = yaw ?? pose.yaw;
                pose.headYaw = headYaw ?? pose.headYaw;
                await world.broadcastMove(actor);
            }),
            setOnGround: vi.fn((onGround: boolean) => void (pose.onGround = onGround)),
            holdsMovementForTeleport: () => false
        });
        let events = 0;
        const { context, settled } = inputContext(session, {
            services: { events: stub<HandlerServices['events']>({ post: () => ++events }) }
        });
        const movement = {
            position: new Vector3(3, 70, -4),
            pitch: 5,
            yaw: 90,
            headYaw: 85,
            onGround: true
        };

        applyClientMovement(context, movement);
        applyClientMovement(context, movement);
        applyClientMovement(context, { ...movement, yaw: 91 });
        applyClientMovement(context, { ...movement, yaw: 91, onGround: false });
        await settled();

        expect(events).toBe(4);
        expect(session.setPlayerPosition).toHaveBeenCalledTimes(2);
        expect(session.setOnGround).toHaveBeenCalledTimes(2);
        // Position plus landing queues twice; the tick replicator coalesces both into the final pose.
        expect(world.broadcastMove).toHaveBeenCalledTimes(4);
    });

    it('moves the player for a normal move of their own runtime id', async () => {
        const scene = fake();
        const { dropped, session } = scene;

        await handle(move(), scene);

        expect(session.setPlayerPosition).toHaveBeenCalledWith(
            { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
            false
        );
        expect(session.setOnGround).toHaveBeenCalledWith(true);
        expect(dropped).toEqual([]);
    });

    it('drops a move the session says was sent before an unacknowledged teleport', async () => {
        const scene = fake();
        const { dropped, session } = scene;
        session.holdsMovementForTeleport = vi.fn(() => true);
        let events = 0;
        scene.events.post = () => ++events;

        await handle(move(), scene);

        expect(session.holdsMovementForTeleport).toHaveBeenCalledWith(new Vector3(3, 70, -4), false);
        expect(session.setPlayerPosition).not.toHaveBeenCalled();
        expect(events).toBe(0);
        expect(dropped).toHaveLength(1);
        expect(dropped[0]).toContain('Dropped a position from tester sent before its teleport');
    });

    it('does not send a second MovePlayer update to observers', async () => {
        const scene = fake();
        const { players, session } = scene;
        const sendMove = vi.fn(async () => {});
        const observer = stub<PlayerSession>({ tracks: () => true, sendMove });
        players.push(session, observer);

        await handle(move(), scene);

        expect(sendMove).not.toHaveBeenCalled();
    });

    it('accepts the head-only mode the docs allow for a player in a vehicle', async () => {
        const scene = fake();
        const { session } = scene;

        await handle(
            move((packet) => {
                packet.mode = PositionMode.OnlyHeadRot;
            }),
            scene
        );

        expect(session.setPlayerPosition).toHaveBeenCalled();
    });

    it('records the packet tick as the input tick before the move is applied', async () => {
        // So a reset sent for this very move carries the tick the client can rewind to.
        const order: string[] = [];
        const scene = fake();
        const { session } = scene;
        session.recordInputTick = vi.fn(() => void order.push('tick'));
        session.setPlayerPosition = vi.fn(async () => void order.push('move'));

        await handle(move(), scene);

        expect(session.recordInputTick).toHaveBeenCalledWith(300n);
        expect(order).toEqual(['tick', 'move']);
    });

    it('drops a move for another runtime id', async () => {
        // "If server-bound, this is always the id of the sending player."
        const scene = fake();
        const { dropped, session } = scene;

        await handle(
            move((packet) => {
                packet.runtimeEntityId = 8n;
            }),
            scene
        );

        expect(session.setPlayerPosition).not.toHaveBeenCalled();
        expect(session.recordInputTick).not.toHaveBeenCalled();
        expect(dropped).toHaveLength(1);
    });

    it.each([PositionMode.Teleport, PositionMode.Respawn])('drops a move in server-only mode %i', async (mode) => {
        // Respawn and Teleport are the server's modes. A client sending one is asking to be
        // put somewhere without walking there, and its Teleport Data is never read.
        const scene = fake();
        const { dropped, session } = scene;

        await handle(
            move((packet) => {
                packet.mode = mode;
                packet.teleportCause = 1;
                packet.teleportItemId = 1;
            }),
            scene
        );

        expect(session.setPlayerPosition).not.toHaveBeenCalled();
        expect(dropped).toHaveLength(1);
    });
});
