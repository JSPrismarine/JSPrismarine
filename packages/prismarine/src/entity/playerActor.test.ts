/**
 * A player is not an entity: its world holds its store player's entity, shown through the
 * player's actor, and every identity check entity code makes compares actors. These cases are the
 * comparisons that used to be made against the player itself.
 */
import { InetAddress } from '@jsprismarine/raknet';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { describe, expect, it } from 'vitest';

import Player from '../Player';
import type Server from '../Server';
import { liveTestEntities } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/Dimension';
import type GameRuleManager from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { World } from '../world/World';
import { NULL_WORLD_CHANGE_SINK } from '../world/WorldChangeSink';
import { canHarm } from './Combat';
import type { StorePlayerActor } from './data/storePlayers';
import { DamageSource } from './DamageSource';
import { deathMessage } from './DeathMessages';

/** A world on the real prototype over a real entity runtime, which holds its players' entities. */
const emptyWorld = (): World => {
    let world: World | undefined;
    const entities = liveTestEntities(() => world);
    const live = entities.entityRuntime(Dimensions.Overworld.name);
    const created: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(),
        entities: new Map(),
        entityChunkIndices: new Map(),
        players: new Map(),
        dimension: Dimensions.Overworld,
        // PvP on, so only the identity of the two sides decides a swing.
        getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
        server: stub<Server>({
            getEntityRuntime: () => live,
            getStorePlayers: () => entities.players,
            getContent: () => entities.content()
        })
    });
    created.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    world = created;
    return created;
};

/** A constructed player, named so two of them can be told apart, in `world`'s store. */
const playerIn = async (world: World, name: string): Promise<{ player: Player; actor: StorePlayerActor }> => {
    const player = new Player({
        position: new Position(0.5, 65.62, 0.5, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: { uuid: UUID.fromRandom(), name, xuid: '', randomId: 0, locale: 'en_US', skin: null, device: null }
    });
    await world.addPlayer(player);
    const actor = player.getActor();
    if (actor === undefined) throw new Error(`${name} has no actor`);
    return { player, actor };
};

describe("a player's actor", () => {
    it('is what the world answers for the player id, and leads back to the store player', async () => {
        const world = emptyWorld();
        const { player, actor } = await playerIn(world, 'Steve');

        expect(world.getActor(player.getRuntimeId())).toBe(actor);
        expect(actor.getRuntimeId()).toBe(player.getRuntimeId());
        expect(actor.player).toBe(player.getStorePlayer());
        expect(player.getBody()).toBe(actor);
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
        const player = new Player({
            position: new Position(0.5, 65.62, 0.5, world),
            address: new InetAddress('127.0.0.1', 19132),
            identity: {
                uuid: UUID.fromRandom(),
                name: 'Joining',
                xuid: '',
                randomId: 0,
                locale: 'en_US',
                skin: null,
                device: null
            }
        });

        expect(player.getActor()).toBeUndefined();
        expect(world.getActor(player.getRuntimeId())).toBeNull();
        expect(world.shownActors()).toEqual([]);
        expect(await player.damage(5)).toBe(false);
        expect(player.getHealth()).toBe(20);
    });
});
