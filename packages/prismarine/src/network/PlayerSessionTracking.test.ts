import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { stub } from '../testing/stub.test.helper';
import type { Position } from '../world/Position';
import { EntityTracker } from './EntityTracker';
import RemoveActorPacket from './packet/RemoveActorPacket';
import PlayerSession from './PlayerSession';

/**
 * How a client's set of visible entities is kept in step with where its player is standing.
 *
 * The tracker decides; this is the half that applies the decision and records what actually
 * went out. The ordering between those two is the whole point: an entity recorded before its
 * spawn reached the wire is one nobody will ever send again.
 */

/**
 * A session with the connection replaced, so what goes on the wire can be counted.
 *
 * `reconciling` seeds the flag a pass sets while it runs, for tests that start mid-pass.
 */
const trackingSession = ({ viewDistance = 10, spawnFails = false, reconciling = false } = {}) => {
    const sent: any[] = [];
    const spawned: bigint[] = [];

    const connection: any = {
        sendDataPacket: async (packet: any) => void sent.push(packet)
    };

    const player: any = {
        getRuntimeId: () => 1n,
        getPosition: () => ({ getX: () => 8, getY: () => 64, getZ: () => 8 }),
        isOnline: () => true,
        viewDistance
    };

    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        player,
        entityTracker: new EntityTracker({ hysteresis: 2, enabled: true }),
        reconciling
    });

    /** An entity that records the spawn instead of building a packet for it. */
    const entityAt = (id: bigint, chunksEast: number, range = 8): Entity =>
        stub<Entity>({
            getRuntimeId: () => id,
            getPosition: () => stub<Position>({ getX: () => chunksEast * 16 + 8, getY: () => 64, getZ: () => 8 }),
            getTrackingRange: () => range,
            spawnTo: async () => {
                if (spawnFails) throw new Error('the wire went away');
                spawned.push(id);
            }
        });

    return { session, sent, spawned, entityAt };
};

describe('network', () => {
    describe('PlayerSession entity tracking', () => {
        describe('considerEntity', () => {
            it('spawns something that arrives nearby', async () => {
                const { session, spawned, entityAt } = trackingSession();

                await session.considerEntity(entityAt(2n, 1));

                expect(spawned).toEqual([2n]);
                expect(session.tracks(2n)).toBe(true);
            });

            it('sends nothing the second time', async () => {
                // `World.addEntity` and the join handler both offer entities, and neither
                // knows what the other did.
                const { session, spawned, entityAt } = trackingSession();

                await session.considerEntity(entityAt(2n, 1));
                await session.considerEntity(entityAt(2n, 1));

                expect(spawned).toEqual([2n]);
            });

            it('ignores something too far away', async () => {
                const { session, spawned, entityAt } = trackingSession();

                await session.considerEntity(entityAt(2n, 50, 32));

                expect(spawned).toEqual([]);
                expect(session.tracks(2n)).toBe(false);
            });

            it('never spawns the player to itself', async () => {
                const { session, spawned, entityAt } = trackingSession();

                await session.considerEntity(entityAt(1n, 0));

                expect(spawned).toEqual([]);
            });
        });

        describe('tracks', () => {
            it('is true for the player own entity', () => {
                // The tracker never holds it - a client is sent no spawn for what it drives -
                // but the client plainly has it, and gates built on `tracks` would otherwise
                // drop the player own hurt and pickup animations.
                const { session } = trackingSession();

                expect(session.tracks(1n)).toBe(true);
            });
        });

        describe('dropEntity', () => {
            it('takes a tracked entity off the client exactly once', async () => {
                const { session, sent, entityAt } = trackingSession();
                const entity = entityAt(2n, 1);

                await session.considerEntity(entity);
                await session.dropEntity(entity);
                await session.dropEntity(entity);

                expect(sent).toHaveLength(1);
                expect(session.tracks(2n)).toBe(false);
            });

            it('sends nothing for an entity the client never had', async () => {
                const { session, sent, entityAt } = trackingSession();

                await session.dropEntity(entityAt(2n, 50, 32));

                expect(sent).toEqual([]);
            });
        });

        describe('reconcileTrackedEntities', () => {
            it('spawns what came into range and despawns what left it', async () => {
                const { session, sent, spawned, entityAt } = trackingSession();
                const near = entityAt(2n, 1);

                await session.reconcileTrackedEntities([near]);
                expect(spawned).toEqual([2n]);

                // Same entity, now well past the despawn radius.
                await session.reconcileTrackedEntities([entityAt(2n, 40, 32)]);
                expect(sent).toHaveLength(1);
                expect(session.tracks(2n)).toBe(false);
            });

            it('leaves an entity untracked when its spawn failed, so the next pass retries', async () => {
                // The lesson `flushChunkBatch` records for chunks: marking before the send
                // means a failure leaves it flagged as delivered and nothing sends it again.
                const { session, entityAt } = trackingSession({ spawnFails: true });

                await expect(session.reconcileTrackedEntities([entityAt(2n, 1)])).rejects.toThrow();

                expect(session.tracks(2n)).toBe(false);
            });

            it('does not run while another pass is running', async () => {
                const { session, spawned, entityAt } = trackingSession({ reconciling: true });

                await session.reconcileTrackedEntities([entityAt(2n, 1)]);

                expect(spawned).toEqual([]);
            });

            it('clears the reconciling flag even when a spawn threw', async () => {
                const { session, entityAt } = trackingSession({ spawnFails: true });

                await expect(session.reconcileTrackedEntities([entityAt(2n, 1)])).rejects.toThrow();

                // A pass left flagged would be skipped silently; one that runs and throws again
                // shows the flag was cleared.
                await expect(session.reconcileTrackedEntities([entityAt(2n, 1)])).rejects.toThrow();
            });
        });

        describe('despawnAllTrackedEntities', () => {
            it('takes every tracked entity off the client and forgets it', async () => {
                // A world change. The client does not drop entities on a dimension change, so
                // each one it holds has to be removed by name.
                const { session, sent, entityAt } = trackingSession();

                await session.considerEntity(entityAt(2n, 1));
                await session.considerEntity(entityAt(3n, 2));
                await session.despawnAllTrackedEntities();

                const removed = sent.filter((packet) => packet instanceof RemoveActorPacket);
                expect(removed.map((packet) => packet.uniqueEntityId).sort()).toEqual([2n, 3n]);
                expect(session.tracks(2n)).toBe(false);
                expect(session.tracks(3n)).toBe(false);
            });

            it('sends nothing the second time', async () => {
                const { session, sent, entityAt } = trackingSession();

                await session.considerEntity(entityAt(2n, 1));
                await session.despawnAllTrackedEntities();
                sent.length = 0;

                await session.despawnAllTrackedEntities();

                expect(sent).toEqual([]);
            });
        });
    });
});
