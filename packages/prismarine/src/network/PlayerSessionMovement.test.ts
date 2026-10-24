import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import { stub } from '../testing/stub.test.helper';
import type MovePlayerPacket from './packet/MovePlayerPacket';
import type SetActorMotionPacket from './packet/SetActorMotionPacket';
import PlayerSession from './PlayerSession';
import MovementType from './type/MovementType';

/**
 * The `Tick` of a `MovePlayerPacket` or `SetActorMotionPacket` is a `PlayerInputTick`. For the
 * receiving client's own player it is the tick of the last `PlayerAuthInputPacket` the server
 * handled; for another player it is zero, because the packet relates to none of this client's
 * inputs. The server's own tick counter is neither.
 */

const playerAt = (runtimeId: bigint) =>
    stub<Player>({
        getRuntimeId: () => runtimeId,
        getPosition: () => new Vector3(1, 64, 1),
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

describe('network', () => {
    describe('PlayerSession movement', () => {
        it('sends a zero tick before the client has sent any input', async () => {
            const { session, sent, player } = movementSession();

            await session.sendMove(player, MovementType.Teleport);

            expect(sent[0]?.tick).toBe(0n);
        });

        it("carries the client's last input tick on a move of their own player", async () => {
            const { session, sent, player } = movementSession();

            session.recordInputTick(42n);
            await session.sendMove(player, MovementType.Reset);

            expect(sent[0]?.runtimeEntityId).toBe(1n);
            expect(sent[0]?.tick).toBe(42n);
        });

        it('sends a zero tick for a move of another player', async () => {
            const { session, sent } = movementSession();

            session.recordInputTick(42n);
            await session.sendMove(playerAt(2n), MovementType.Normal);

            expect(sent[0]?.runtimeEntityId).toBe(2n);
            expect(sent[0]?.tick).toBe(0n);
        });

        it('fills a teleport with an unknown cause and leaves the riding id at zero', async () => {
            const { session, sent, player } = movementSession();

            await session.sendMove(player, MovementType.Teleport);

            const [packet] = sent;
            expect(packet).toHaveProperty('mode', MovementType.Teleport);
            expect(packet).toHaveProperty('teleportCause', 0);
            expect(packet).toHaveProperty('teleportItemId', 0);
            expect(packet).toHaveProperty('ridingEntityRuntimeId', 0n);
        });

        it("carries the client's last input tick on a motion", async () => {
            const { session, sent } = movementSession();

            session.recordInputTick(7n);
            await session.sendMotion(new Vector3(0.5, 0.4, 0));

            expect(sent[0]?.runtimeEntityId).toBe(1n);
            expect(sent[0]?.tick).toBe(7n);
            expect(sent[0]).toHaveProperty('motion', new Vector3(0.5, 0.4, 0));
        });
    });
});
