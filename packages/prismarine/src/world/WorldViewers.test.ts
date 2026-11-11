import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import { StorePlayerActor } from '../entity/data/storePlayers';
import { liveTestEntities } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { stubPlayerPort } from '../testing/playerPort.test.helper';
import { playerOnPrototype } from '../testing/storePlayer.test.helper';
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
        let world: World | undefined;
        const entities = liveTestEntities(() => world);
        const live = entities.entityRuntime(Dimensions.Overworld.name);
        const server = stub<Server>({
            getEntityRuntime: () => live,
            getStorePlayers: () => entities.players,
            getContent: () => entities.content()
        });
        const created: World = Object.assign(Object.create(World.prototype), {
            chunks: new Map(),
            entities: new Map(),
            entityChunkIndices: new Map(),
            players: new Map(),
            dimension: Dimensions.Overworld,
            server
        });
        world = created;
        const player = playerOnPrototype(
            { getNetworkSession: () => session, isOnline: () => true },
            { runtimeId: 4n, position: new Position(0.5, 65.62, 0.5, created) }
        );
        // What the replicator sees when it shows an arriving player the world and a leaving one
        // goes: the arrival already findable, the departure already not.
        const seen: Array<PlayerSession | undefined> = [];
        created.attachChangeSink({
            ...NULL_WORLD_CHANGE_SINK,
            entityAdded: async (entity) => void seen.push(created.viewerOf(entity.getRuntimeId())),
            entityRemoved: async (entity) => void seen.push(created.viewerOf(entity.getRuntimeId()))
        });

        await created.addPlayer(player);
        expect(created.viewerOf(4n)).toBe(session);
        // The world answers the store player's actor under the player's id, not the player.
        const actor = created.getActor(4n);
        expect(actor).toBeInstanceOf(StorePlayerActor);
        expect(actor instanceof StorePlayerActor && actor.player).toBe(player.getStorePlayer());
        expect(created.getEntity(4n)).toBeNull();

        await created.removePlayer(player);
        expect(created.viewerOf(4n)).toBeUndefined();
        expect(created.getActor(4n)).toBeNull();
        expect(seen).toEqual([session, undefined]);
    });
});
