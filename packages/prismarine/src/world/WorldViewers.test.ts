import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import { inertEntityRuntime } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { stubPlayerPort } from '../testing/playerPort.test.helper';
import { playerOnPrototype } from '../testing/playerDouble.test.helper';
import { Dimensions } from './Dimension';
import { Position } from './Position';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';

/** A player in the world, joined or still joining, with the session its client speaks through. */
const playerWith = (runtimeId: bigint, online: boolean) => {
    const session = stub<PlayerSession>({ runtimeId });
    const player = stubPlayerPort({
        getRuntimeId: () => runtimeId,
        getNetworkSession: () => session,
        isOnline: () => online
    });
    return { player, session };
};

/** A world holding these players in its player map, by entity id. */
const worldWith = (...players: Player[]): World =>
    Object.assign(Object.create(World.prototype), {
        players: new Map(players.map((player) => [Number(player.getRuntimeId()), player]))
    });

describe('World viewers', () => {
    it("lists the sessions of the world's online players", () => {
        const joined = playerWith(1n, true);
        const joining = playerWith(2n, false);

        expect(worldWith(joined.player, joining.player).getViewers()).toEqual([joined.session]);
    });

    it("finds a player's session by its entity id, whether or not it has joined", () => {
        const joined = playerWith(1n, true);
        const joining = playerWith(2n, false);
        const world = worldWith(joined.player, joining.player);

        expect(world.viewerOf(1n)).toBe(joined.session);
        expect(world.viewerOf(2n)).toBe(joining.session);
        expect(world.viewerOf(3n)).toBeUndefined();
    });

    it('finds a player added through addPlayer before anyone is told it arrived, and none after removePlayer', async () => {
        const session = stub<PlayerSession>({ runtimeId: 4n });
        const world: World = Object.assign(Object.create(World.prototype), {
            chunks: new Map(),
            entities: new Map(),
            entityChunkIndices: new Map(),
            players: new Map(),
            dimension: Dimensions.Overworld,
            server: stub<Server>({ getEntityRuntime: () => inertEntityRuntime() })
        });
        const player = playerOnPrototype(
            { getNetworkSession: () => session, isOnline: () => true },
            {
                runtimeId: 4n,
                position: new Position(0.5, 65.62, 0.5, world),
                getBox: () => ({ width: 0.6, height: 1.8 })
            }
        );
        // What the replicator sees when it shows an arriving player the world and a leaving one
        // goes: the arrival already findable, the departure already not.
        const seen: Array<PlayerSession | undefined> = [];
        world.attachChangeSink({
            ...NULL_WORLD_CHANGE_SINK,
            entityAdded: async (entity) => void seen.push(world.viewerOf(entity.getRuntimeId())),
            entityRemoved: async (entity) => void seen.push(world.viewerOf(entity.getRuntimeId()))
        });

        await world.addPlayer(player);
        expect(world.viewerOf(4n)).toBe(session);
        // The world holds the player's body as the entity under the player's id, not the player.
        expect(world.getEntity(4n)).toBe(player.getBody());

        await world.removePlayer(player);
        expect(world.viewerOf(4n)).toBeUndefined();
        expect(world.getEntity(4n)).toBeNull();
        expect(seen).toEqual([session, undefined]);
    });
});
