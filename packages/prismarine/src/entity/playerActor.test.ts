/**
 * A player is not an entity: its world holds its store player's entity, shown through the
 * player's actor, and every identity check entity code makes compares actors. These cases are the
 * comparisons that used to be made against the player itself.
 */
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { Config } from '../config/Config';
import type ClientConnection from '../network/ClientConnection';
import type PlayerSession from '../network/PlayerSession';
import { sessionFor } from '../testing/playerSession.test.helper';
import { liveTestEntities } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/DimensionType';
import type GameRuleManager from '../world/GameRuleManager';
import { World } from '../world/World';
import { NULL_WORLD_CHANGE_SINK } from '../world/WorldChangeSink';
import { canHarm } from './Combat';
import type { StorePlayerActor } from './data/storePlayers';
import { entityIds } from './entityIds';
import { EYE_HEIGHT } from './playerEyes';
import { StorePlayer } from './storePlayer';
import { DamageSource } from './DamageSource';
import { deathMessage } from './DeathMessages';

/** A world on the real prototype over a real entity runtime, which holds its players' entities. */
const emptyWorld = (): World => {
    let world: World | undefined;
    const entities = liveTestEntities(() => world);
    const live = entities.entityRuntime(Dimensions.Overworld.name);
    const created: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(),
        players: new Map(),
        dimension: Dimensions.Overworld,
        // PvP on, so only the identity of the two sides decides a swing.
        getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
        server: stub<Server>({
            getEntityRuntime: () => live,
            getStorePlayers: () => entities.players,
            getContent: () => entities.content(),
            getConfig: () => stub<Config>({ getEntityTrackingHysteresis: () => 2, getProximityBroadcast: () => true })
        })
    });
    created.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    world = created;
    return created;
};

/** A store player as a login builds one, and the session that speaks for it, in `world`. */
const joining = (world: World, name: string): { player: StorePlayer; session: PlayerSession } => {
    const player = new StorePlayer(entityIds.next(), { uuid: UUID.fromRandom(), name, xuid: '' });
    player.standAt({ x: 0.5, y: 65.62 - EYE_HEIGHT, z: 0.5 });
    world.getServer().getStorePlayers().add(player);
    const session = sessionFor(world.getServer(), stub<ClientConnection>(), player, {
        runtimeId: player.getRuntimeId(),
        identity: { name, xuid: '', uuid: player.getUUID().toString() },
        world
    });
    return { player, session };
};

/** A player, named so two of them can be told apart, in `world`'s store. */
const playerIn = async (
    world: World,
    name: string
): Promise<{ player: StorePlayer; session: PlayerSession; actor: StorePlayerActor }> => {
    const { player, session } = joining(world, name);
    await world.addPlayer(session);
    const actor = session.getActor();
    if (actor === undefined) throw new Error(`${name} has no actor`);
    return { player, session, actor };
};

describe("a player's actor", () => {
    it('is what the world answers for the player id, and leads back to the store player', async () => {
        const world = emptyWorld();
        const { player, session, actor } = await playerIn(world, 'Steve');

        expect(world.getActor(player.getRuntimeId())).toBe(actor);
        expect(actor.getRuntimeId()).toBe(player.getRuntimeId());
        expect(actor.player).toBe(player);
        expect(session.shown()).toBe(actor);
    });

    it('cannot hit itself through the entity the world answers for its id', async () => {
        const world = emptyWorld();
        const steve = await playerIn(world, 'Steve');
        const alex = await playerIn(world, 'Alex');

        const steveAsTarget = world.getActor(steve.player.getRuntimeId());
        const alexAsTarget = world.getActor(alex.player.getRuntimeId());
        if (steveAsTarget === null || alexAsTarget === null) throw new Error('the world lost a player');

        expect(canHarm(steve.actor, steveAsTarget)).toBe(false);
        expect(canHarm(steve.actor, alexAsTarget)).toBe(true);
    });

    it('names no killer for a blow the player struck themselves', async () => {
        const world = emptyWorld();
        const steve = await playerIn(world, 'Steve');
        const alex = await playerIn(world, 'Alex');

        expect(deathMessage(steve.actor, DamageSource.entity(steve.actor)).parameters).toEqual(['Steve']);
        expect(deathMessage(steve.actor, DamageSource.entity(alex.actor)).parameters).toEqual(['Steve', 'Alex']);
    });

    it('is not there before the player enters its world, so nothing can target or see it', async () => {
        const world = emptyWorld();
        const { player, session } = joining(world, 'Joining');

        expect(session.getActor()).toBeUndefined();
        expect(world.getActor(player.getRuntimeId())).toBeNull();
        expect([...world.actors()]).toEqual([]);
        expect(player.getHealth()).toBe(20);
    });
});
