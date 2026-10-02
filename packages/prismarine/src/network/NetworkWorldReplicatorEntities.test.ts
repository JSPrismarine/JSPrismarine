import { describe, expect, it } from 'vitest';

import Player from '../Player';
import type Server from '../Server';
import type { Entity } from '../entity/Entity';
import type { World } from '../world/World';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';

/**
 * Who is shown what, as entities come and go.
 *
 * This used to live in `World.addEntity` and `World.removeEntity`, reaching through every
 * player into their session. Moving it here left it with no test at all, and the parts that
 * are easy to get subtly wrong - the arrival not being offered itself, a departure being told
 * about its own departure - are exactly the ones that were fixed once already.
 */
const fakeSession = () => {
    const considered: bigint[] = [];
    const dropped: bigint[] = [];
    const reconciled: bigint[][] = [];
    const queued: bigint[] = [];
    let flushes = 0;
    const tracked = new Set<bigint>();

    return {
        considered,
        dropped,
        reconciled,
        queued,
        tracked,
        get flushes() {
            return flushes;
        },
        session: {
            considerEntity: async (entity: Entity) => void considered.push(entity.getRuntimeId()),
            dropEntity: async (entity: Entity) => void dropped.push(entity.getRuntimeId()),
            reconcileTrackedEntities: async (entities: Entity[]) =>
                void reconciled.push(entities.map((one) => one.getRuntimeId())),
            queueMoveActor: (entity: Entity) => void queued.push(entity.getRuntimeId()),
            flushQueuedMoves: async () => void flushes++,
            tracks: (runtimeId: bigint) => tracked.has(runtimeId)
        }
    };
};

/** A player-controlled entity, real enough for `instanceof Player` to hold. */
const fakePlayer = (runtimeId: bigint) => {
    const spy = fakeSession();
    const player: any = Object.create(Player.prototype);

    Object.assign(player, {
        getRuntimeId: () => runtimeId,
        getNetworkSession: () => spy.session,
        isOnline: () => true
    });

    return { player: player as Player, spy };
};

/** A mob: in the world, but nobody's client. */
const fakeMob = (runtimeId: bigint): Entity => ({ getRuntimeId: () => runtimeId }) as unknown as Entity;

const replicatorOver = ({ players = [] as Player[], entities = [] as Entity[] } = {}) => {
    const world = {
        getName: () => 'test',
        getPlayers: () => players,
        getEntities: () => entities
    } as unknown as World;

    const server = {
        getConfig: () => ({ getProximityBroadcast: () => true }),
        getLogger: () => ({ verbose: () => {}, error: () => {} })
    } as unknown as Server;

    return new NetworkWorldReplicator(world, server);
};

describe('network', () => {
    describe('NetworkWorldReplicator entities', () => {
        describe('entityAdded', () => {
            it('shows an arriving player everything already here', async () => {
                const { player, spy } = fakePlayer(1n);
                const mob = fakeMob(2n);
                const replicator = replicatorOver({ players: [player], entities: [mob] });

                await replicator.entityAdded(player);

                expect(spy.reconciled).toStrictEqual([[2n]]);
            });

            it('does not offer an arriving player to itself', async () => {
                // A client is never sent a spawn for the entity it is controlling.
                const { player, spy } = fakePlayer(1n);
                const replicator = replicatorOver({ players: [player], entities: [player] });

                await replicator.entityAdded(player);

                expect(spy.considered).toStrictEqual([]);
            });

            it('offers an arriving mob to everyone already here', async () => {
                const first = fakePlayer(1n);
                const second = fakePlayer(2n);
                const mob = fakeMob(3n);
                const replicator = replicatorOver({ players: [first.player, second.player] });

                await replicator.entityAdded(mob);

                expect(first.spy.considered).toStrictEqual([3n]);
                expect(second.spy.considered).toStrictEqual([3n]);
                // A mob has no client, so nothing is shown the world on its behalf.
                expect(first.spy.reconciled).toStrictEqual([]);
            });

            it('shows an arriving player to the players already here', async () => {
                // The bug this replaced: an arriving player was shown the world, but the world
                // was never shown them.
                const resident = fakePlayer(1n);
                const arriving = fakePlayer(2n);
                const replicator = replicatorOver({ players: [resident.player, arriving.player] });

                await replicator.entityAdded(arriving.player);

                expect(resident.spy.considered).toStrictEqual([2n]);
            });
        });

        describe('entityRemoved', () => {
            it('tells every client to forget it', async () => {
                // Every client, tracking or not: a stale id left behind would block that entity
                // from ever being tracked again.
                const first = fakePlayer(1n);
                const second = fakePlayer(2n);
                const mob = fakeMob(3n);
                const replicator = replicatorOver({ players: [first.player, second.player] });

                await replicator.entityRemoved(mob);

                expect(first.spy.dropped).toStrictEqual([3n]);
                expect(second.spy.dropped).toStrictEqual([3n]);
            });
        });

        describe('entityMoved', () => {
            it('queues only for the clients that have the entity', () => {
                // A move for a runtime id a client was never sent a spawn for is discarded at
                // the other end, so tracking is both the correct gate and the cheaper one.
                const watching = fakePlayer(1n);
                const blind = fakePlayer(2n);
                const mob = fakeMob(3n);

                watching.spy.tracked.add(3n);

                const replicator = replicatorOver({ players: [watching.player, blind.player] });
                replicator.entityMoved(mob);

                expect(watching.spy.queued).toStrictEqual([3n]);
                expect(blind.spy.queued).toStrictEqual([]);
            });
        });

        describe('flushMovement', () => {
            it('flushes every client once', async () => {
                const first = fakePlayer(1n);
                const second = fakePlayer(2n);
                const replicator = replicatorOver({ players: [first.player, second.player] });

                await replicator.flushMovement();

                expect(first.spy.flushes).toBe(1);
                expect(second.spy.flushes).toBe(1);
            });
        });
    });
});
