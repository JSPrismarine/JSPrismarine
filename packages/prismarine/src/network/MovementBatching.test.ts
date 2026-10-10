import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import PlayerSession from './PlayerSession';

/**
 * How a tick's entity movement reaches the client.
 *
 * This is where mobs moving in fits and starts came from, and neither half of it is visible in the
 * movement model. Sending each move on its own meant every mob cost a compressed batch and a RakNet
 * frame of its own, per player, per tick - and `sendDataPacket` queues behind any chunk still
 * compressing, so while a walking player streamed terrain every mob's movement waited behind it and
 * then arrived all at once. Mobs froze and jumped in the rhythm the chunks were arriving in.
 */

/** A session with the connection replaced, so what actually goes on the wire can be counted. */
const sessionWithCountedSends = () => {
    const batches: any[] = [];
    const singles: any[] = [];

    const connection: any = {
        sendBatch: (batch: any) => batches.push(batch),
        sendDataPacket: async (packet: any) => void singles.push(packet)
    };

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        queuedMoves: new Map()
    });

    return { session, batches, singles };
};

const someWorld = () => ({ getName: () => 'test', getServer: () => ({}) }) as unknown as World;

/** An entity with just the parts a movement packet reads. */
const entityAt = (id: bigint, x: number): Entity =>
    ({
        getRuntimeId: () => id,
        getPosition: () => new Position(x, 65, 0, someWorld()),
        pitch: 0,
        yaw: 0,
        headYaw: 0
    }) as unknown as Entity;

describe('entity movement on the wire', () => {
    it('sends a whole tick of movement as one batch', async () => {
        // Thirty mobs used to mean thirty compressions and thirty frames per player per tick. The
        // batch exists precisely so that it is one of each instead.
        const { session, batches, singles } = sessionWithCountedSends();

        for (let index = 0; index < 30; index++) session.queueMoveActor(entityAt(BigInt(index), index));
        await session.flushQueuedMoves();

        expect(batches).toHaveLength(1);
        expect(singles).toHaveLength(0);

        // All thirty are in it, not just the last.
        expect(batches[0].getPackets()).toHaveLength(30);
    });

    it('sends nothing at all when nothing moved', async () => {
        // A world of idle mobs must not cost a packet per tick to say so.
        const { session, batches } = sessionWithCountedSends();
        await session.flushQueuedMoves();

        expect(batches).toHaveLength(0);
    });

    it('empties the queue, so a tick cannot resend the last one', async () => {
        const { session, batches } = sessionWithCountedSends();

        session.queueMoveActor(entityAt(1n, 1));
        await session.flushQueuedMoves();
        await session.flushQueuedMoves();

        expect(batches).toHaveLength(1);
    });

    it('sends one packet for an entity that moved more than once in a tick', async () => {
        // `Entity.setX`, `setY` and `setZ` each announce a move of their own, so a single
        // diagonal step queued three packets naming the same destination.
        const { session, batches } = sessionWithCountedSends();

        session.queueMoveActor(entityAt(1n, 1));
        session.queueMoveActor(entityAt(1n, 2));
        session.queueMoveActor(entityAt(1n, 3));
        await session.flushQueuedMoves();

        expect(batches[0].getPackets()).toHaveLength(1);
    });

    it('keeps the order entities first moved in', async () => {
        const { session, batches } = sessionWithCountedSends();

        session.queueMoveActor(entityAt(7n, 1));
        session.queueMoveActor(entityAt(3n, 1));
        session.queueMoveActor(entityAt(7n, 2));
        await session.flushQueuedMoves();

        const ids = batches[0].getPackets().map((encoded: Buffer) => encoded.readUInt8(1));
        expect(ids).toEqual([7, 3]);
    });

    it('still sends a one-off move on its own', async () => {
        // A teleport or a command happens outside the tick and should not wait for one.
        const { session, singles } = sessionWithCountedSends();

        await session.sendMoveActor(entityAt(1n, 1));
        expect(singles).toHaveLength(1);
    });

    it('carries the rotation, not just the position', async () => {
        // Left at zero, every mob faced north whatever it was doing.
        const { session, batches } = sessionWithCountedSends();

        const entity = entityAt(1n, 1);
        (entity as any).yaw = 90;
        (entity as any).headYaw = 45;

        session.queueMoveActor(entity);
        await session.flushQueuedMoves();

        const [encoded] = batches[0].getPackets();

        // Rotation is three bytes at the tail: pitch, head yaw, body yaw, each an angle scaled onto
        // a byte. Non-zero is the whole claim - the exact encoding is the packet's own test.
        const rotation = encoded.subarray(encoded.length - 3);
        expect([...rotation]).not.toEqual([0, 0, 0]);
    });
});
