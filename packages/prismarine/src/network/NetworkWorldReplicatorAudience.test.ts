import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type { Config } from '../config/Config';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { NetworkWorldReplicator } from './NetworkWorldReplicator';

/**
 * Who receives a positional packet.
 *
 * The single question this whole feature exists to answer, so it is asked here directly
 * rather than through the packets built on top of it.
 */

/**
 * A player standing `chunksEast` chunks from the origin.
 *
 * The position's world is a placeholder: the replicator only reads the player's coordinates,
 * and the world it checks is the one on the position passed to `getViewers`.
 */
const playerAt = (chunksEast: number, { viewDistance = 10, online = true } = {}) =>
    stub<Player>({
        getPosition: () => new Position(chunksEast * 16 + 8, 64, 8, stub<World>()),
        isOnline: () => online,
        viewDistance
    });

const fakeWorld = ({ players = [], proximity = true }: { players?: Player[]; proximity?: boolean } = {}) => {
    const logged: string[] = [];

    // Only what the audience question actually reads of a world: who is in it, and its name
    // for the cross-world complaint. Deciding who receives something is the replicator's, so
    // that is the code under test.
    const world = stub<World>({
        getName: () => 'test',
        getPlayers: () => players.filter((player) => player.isOnline())
    });

    const server = stub<Server>({
        getConfig: () => stub<Config>({ getProximityBroadcast: () => proximity }),
        getLogger: () => stub<Logger>({ verbose: (message: string) => void logged.push(message) })
    });

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

            expect(replicator.getViewers(here, { exclude: near })).toEqual([other]);
            expect(replicator.getViewers(here, { exclude: [near, other] })).toEqual([]);
        });

        it('leaves out players who are not online', () => {
            const { replicator } = fakeWorld({ players: [playerAt(3, { online: false })] });

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

                expect(replicator.getViewers(here, { exclude: near })).toEqual([]);
            });
        });
    });
});
