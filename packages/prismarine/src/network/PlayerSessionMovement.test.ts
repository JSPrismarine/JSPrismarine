import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import SetActorMotionPacket from '@jsprismarine/protocol/packet/SetActorMotionPacket';
import PlayerSession from './PlayerSession';

import type { MovePlayer } from '@jsprismarine/protocol/packet/MovePlayerPacket';

/**
 * The `Tick` of a `MovePlayerPacket` or `SetActorMotionPacket` is a `PlayerInputTick`. For the
 * receiving client's own player it is the tick of the last `PlayerAuthInputPacket` the server
 * handled; for another player it is zero, because the packet relates to none of this client's
 * inputs. The server's own tick counter is neither.
 */

/** The world a position has to name; nothing on this path reads it back out. */
const nowhere = stub<World>();

const playerAt = (runtimeId: bigint) =>
    stub<Player>({
        getRuntimeId: () => runtimeId,
        getPosition: () => new Position(1, 64, 1, nowhere),
        pitch: 10,
        yaw: 20,
        headYaw: 30,
        isOnGround: () => true
    });

/** A session with the connection replaced, so the packets that go out can be inspected. */
const movementSession = () => {
    const sent: Array<MovePlayerPacket | SetActorMotionPacket> = [];
    const player = playerAt(1n);
    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection: {
            sendDataPacket: async (packet: MovePlayerPacket | SetActorMotionPacket) => void sent.push(packet)
        },
        player,
        lastInputTick: 0n
    });

    return { session, sent, player };
};

const moveData = (packets: readonly (MovePlayerPacket | SetActorMotionPacket)[], index = 0): MovePlayer | undefined => {
    const packet = packets[index];
    return packet instanceof MovePlayerPacket ? (packet.getPacketData() ?? undefined) : undefined;
};

describe('network', () => {
    describe('PlayerSession movement', () => {
        it('sends a zero tick before the client has sent any input', async () => {
            const { session, sent, player } = movementSession();

            await session.sendMove(player, PositionMode.Teleport);

            expect(moveData(sent)?.tick).toBe(0n);
        });

        it("carries the client's last input tick on a move of their own player", async () => {
            const { session, sent, player } = movementSession();

            session.recordInputTick(42n);
            await session.sendMove(player, PositionMode.Respawn);

            expect(moveData(sent)?.runtimeEntityId).toBe(1n);
            expect(moveData(sent)?.tick).toBe(42n);
        });

        it('sends a zero tick for a move of another player', async () => {
            const { session, sent } = movementSession();

            session.recordInputTick(42n);
            await session.sendMove(playerAt(2n), PositionMode.Normal);

            expect(moveData(sent)?.runtimeEntityId).toBe(2n);
            expect(moveData(sent)?.tick).toBe(0n);
        });

        it('fills a teleport with an unknown cause and leaves the riding id at zero', async () => {
            const { session, sent, player } = movementSession();

            await session.sendMove(player, PositionMode.Teleport);

            expect(moveData(sent)).toMatchObject({
                mode: PositionMode.Teleport,
                teleportCause: 0,
                teleportItemId: 0,
                ridingEntityRuntimeId: 0n
            });
        });

        it("carries the client's last input tick on a motion", async () => {
            const { session, sent } = movementSession();

            session.recordInputTick(7n);
            await session.sendMotion(new Vector3(0.5, 0.4, 0));

            const packet = sent[0];
            if (!(packet instanceof SetActorMotionPacket)) throw new Error('Expected SetActorMotionPacket');

            expect(packet.runtimeEntityId).toBe(1n);
            expect(packet.tick).toBe(7n);
            expect(packet.motion).toEqual(new Vector3(0.5, 0.4, 0));
        });
    });
});
