import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';

/**
 * Who receives a positional packet.
 *
 * The single question this whole feature exists to answer, so it is asked here directly
 * rather than through the packets built on top of it.
 */

/** A player standing `chunksEast` chunks from the origin. */
const playerAt = (chunksEast: number, viewDistance = 10) => ({
    getPosition: () => new Vector3(chunksEast * 16 + 8, 64, 8),
    isOnline: () => true,
    viewDistance
});

const fakeWorld = ({ players = [] as any[], proximity = true } = {}) => {
    const logged: string[] = [];

    // Only what the audience question actually reads of a world: who is in it, and its name
    // for the cross-world complaint. Deciding who receives something is the replicator's, so
    // that is the code under test.
    const world = {
        getName: () => 'test',
        getPlayers: () => players.filter((player) => player.isOnline())
    } as unknown as World;

    const server = {
        getConfig: () => ({ getProximityBroadcast: () => proximity }),
        getLogger: () => ({ verbose: (message: string) => void logged.push(message) })
    } as unknown as Server;

    return { world, replicator: new NetworkWorldReplicator(world, server), logged };
};

describe('network', () => {
    describe('NetworkWorldReplicator audience', () => {
        const here = new Vector3(8, 64, 8);

        it('includes a player a few chunks away', () => {
            const near = playerAt(3);
            const { replicator } = fakeWorld({ players: [near] });

            expect(replicator.getViewers(here)).toEqual([near]);
        });

        it('excludes a player far outside their own view distance', () => {
            const { replicator } = fakeWorld({ players: [playerAt(40)] });

            expect(replicator.getViewers(here)).toEqual([]);
        });

        it('returns everyone when there is no position', () => {
            // The world-wide case: the time of day is not about a place.
            const near = playerAt(3);
            const far = playerAt(40);
            const { replicator } = fakeWorld({ players: [near, far] });

            expect(replicator.getViewers(null)).toEqual([near, far]);
        });

        it('leaves out an excluded player', () => {
            const near = playerAt(3);
            const other = playerAt(4);
            const { replicator } = fakeWorld({ players: [near, other] });

            expect(replicator.getViewers(here, { exclude: near as any })).toEqual([other]);
            expect(replicator.getViewers(here, { exclude: [near, other] as any })).toEqual([]);
        });

        it('leaves out players who are not online', () => {
            const { replicator } = fakeWorld({ players: [{ ...playerAt(3), isOnline: () => false }] });

            expect(replicator.getViewers(here)).toEqual([]);
        });

        it('narrows to a tighter block radius', () => {
            // What a sound uses: audible nearby, not across everything the client can see.
            const near = playerAt(3);
            const { replicator } = fakeWorld({ players: [near] });

            expect(replicator.getViewers(here)).toEqual([near]);
            expect(replicator.getViewers(here, { radius: 16 })).toEqual([]);
        });

        it('refuses a position belonging to another world', () => {
            // The guard against the class of bug where placing a block announced it to every
            // player on the server, in every world.
            const near = playerAt(3);
            const { replicator, logged } = fakeWorld({ players: [near] });
            const { world: elsewhere } = fakeWorld();

            expect(replicator.getViewers(new Position(8, 64, 8, elsewhere))).toEqual([]);
            expect(logged).toHaveLength(1);
        });

        it('accepts a position belonging to this world', () => {
            const near = playerAt(3);
            const { world, replicator } = fakeWorld({ players: [near] });

            expect(replicator.getViewers(new Position(8, 64, 8, world))).toEqual([near]);
        });

        describe('with proximity broadcasting turned off', () => {
            it('reaches everyone in the world whatever the distance', () => {
                // The escape hatch restores world-wide delivery - not the server-wide fan-out
                // some of these call sites used to have, which was a bug.
                const far = playerAt(40);
                const { replicator } = fakeWorld({ players: [far], proximity: false });

                expect(replicator.getViewers(here)).toEqual([far]);
            });

            it('still honours exclusions', () => {
                const near = playerAt(3);
                const { replicator } = fakeWorld({ players: [near], proximity: false });

                expect(replicator.getViewers(here, { exclude: near as any })).toEqual([]);
            });
        });
    });
});
