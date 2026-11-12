import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type PlayerSession from '../network/PlayerSession';
import { StorePlayerActor } from '../entity/data/storePlayers';
import { liveTestEntities } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { Dimensions } from './DimensionType';
import { Position } from './Position';
import { World } from './World';
import { NULL_WORLD_CHANGE_SINK } from './WorldChangeSink';
import { QUIET_TICK_HEADER } from '../testing/tickHeader.test.helper';

/** The session of a player in the world, joined or still joining. */
const playerWith = (runtimeId: bigint, online: boolean) => ({
    session: stub<PlayerSession>({ runtimeId, isConnected: () => online })
});

/** A world holding these sessions in its player map, by entity id. */
const worldWith = (...sessions: PlayerSession[]): World =>
    Object.assign(Object.create(World.prototype), {
        tickHeader: () => QUIET_TICK_HEADER,
        players: new Map(sessions.map((session) => [Number(session.runtimeId), session]))
    });

describe('World viewers', () => {
    it("lists the sessions of the world's online players", () => {
        const joined = playerWith(1n, true);
        const joining = playerWith(2n, false);

        expect(worldWith(joined.session, joining.session).getViewers()).toEqual([joined.session]);
    });

    it("finds a player's session by its entity id, whether or not it has joined", () => {
        const joined = playerWith(1n, true);
        const joining = playerWith(2n, false);
        const world = worldWith(joined.session, joining.session);

        expect(world.viewerOf(1n)).toBe(joined.session);
        expect(world.viewerOf(2n)).toBe(joining.session);
        expect(world.viewerOf(3n)).toBeUndefined();
    });

    it('finds a player added through addPlayer when the tick that logged it seals, and none after removePlayer', async () => {
        let world: World | undefined;
        const entities = liveTestEntities(() => world);
        const live = entities.entityRuntime(Dimensions.Overworld.name);
        const server = stub<Server>({
            getEntityRuntime: () => live,
            getStorePlayers: () => entities.players,
            getContent: () => entities.content()
        });
        const created: World = Object.assign(Object.create(World.prototype), {
            tickHeader: () => QUIET_TICK_HEADER,
            chunks: new Map(),
            players: new Map(),
            dimension: Dimensions.Overworld,
            server
        });
        world = created;
        const session = sessionOnPrototype({}, { runtimeId: 4n, position: new Position(0.5, 65.62, 0.5, created) });
        // What the replicator sees when it reads an arriving player's entering entry and a
        // leaving one's leaving entry: the arrival already findable, the departure already not.
        const seen: Array<PlayerSession | undefined> = [];
        created.attachChangeSink(NULL_WORLD_CHANGE_SINK);
        created.getEntityStore().onSealed((sealed) => {
            for (const entry of sealed.entries)
                if (entry.kind === 'membership') seen.push(created.viewerOf(entry.entity));
        });

        created.beginChangeTick();
        await created.addPlayer(session);
        created.sealChangeTick();
        expect(created.viewerOf(4n)).toBe(session);
        // The world answers the store player's actor under the player's id, not the player.
        const actor = created.getActor(4n);
        expect(actor).toBeInstanceOf(StorePlayerActor);
        expect(actor instanceof StorePlayerActor && actor.player).toBe(session.getPlayer());

        created.beginChangeTick();
        created.removePlayer(session);
        created.sealChangeTick();
        expect(created.viewerOf(4n)).toBeUndefined();
        expect(created.getActor(4n)).toBeNull();
        expect(seen).toEqual([session, undefined]);
    });
});
