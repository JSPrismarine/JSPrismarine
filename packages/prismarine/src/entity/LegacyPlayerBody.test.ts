/**
 * A player is not an entity: the world holds its body, and every identity check entity code makes
 * compares bodies. These cases are the comparisons that used to be made against the player itself.
 */
import { InetAddress } from '@jsprismarine/raknet';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { describe, expect, it } from 'vitest';

import Player from '../Player';
import type Server from '../Server';
import { inertEntityRuntime, testContent } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/Dimension';
import type GameRuleManager from '../world/GameRuleManager';
import { Position } from '../world/Position';
import { World } from '../world/World';
import { NULL_WORLD_CHANGE_SINK } from '../world/WorldChangeSink';
import { canHarm } from './Combat';
import { DamageSource } from './DamageSource';
import { deathMessage } from './DeathMessages';

/** A world on the real prototype, holding entities in its own maps. */
const emptyWorld = (): World => {
    const world: World = Object.assign(Object.create(World.prototype), {
        chunks: new Map(),
        entities: new Map(),
        entityChunkIndices: new Map(),
        players: new Map(),
        dimension: Dimensions.Overworld,
        // PvP on, so only the identity of the two sides decides a swing.
        getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
        server: stub<Server>({ getEntityRuntime: () => inertEntityRuntime(), getContent: () => testContent() })
    });
    world.attachChangeSink(NULL_WORLD_CHANGE_SINK);
    return world;
};

/** A constructed player, named so two of them can be told apart. */
const playerIn = (world: World, name: string): Player =>
    new Player({
        position: new Position(0.5, 65.62, 0.5, world),
        address: new InetAddress('127.0.0.1', 19132),
        identity: { uuid: UUID.fromRandom(), name, xuid: '', randomId: 0, locale: 'en_US', skin: null, device: null }
    });

describe("a player's body", () => {
    it('is what the world holds under the player id, and leads back to the player', async () => {
        const world = emptyWorld();
        const player = playerIn(world, 'Steve');

        await world.addPlayer(player);

        const body = player.getBody();
        expect(world.getEntity(player.getRuntimeId())).toBe(body);
        expect(world.getActor(player.getRuntimeId())).toBe(body);
        expect(body.getRuntimeId()).toBe(player.getRuntimeId());
        expect(body.player).toBe(player);
    });

    it('cannot hit itself through the entity the world answers for its id', async () => {
        const world = emptyWorld();
        const steve = playerIn(world, 'Steve');
        const alex = playerIn(world, 'Alex');
        await world.addPlayer(steve);
        await world.addPlayer(alex);

        const steveAsTarget = world.getActor(steve.getRuntimeId());
        const alexAsTarget = world.getActor(alex.getRuntimeId());
        if (steveAsTarget === null || alexAsTarget === null) throw new Error('the world lost a player');

        expect(canHarm(steve.getBody(), steveAsTarget)).toBe(false);
        expect(canHarm(steve.getBody(), alexAsTarget)).toBe(true);
    });

    it('names no killer for a blow the player struck themselves', async () => {
        const world = emptyWorld();
        const steve = playerIn(world, 'Steve');
        const alex = playerIn(world, 'Alex');
        await world.addPlayer(steve);
        await world.addPlayer(alex);

        expect(deathMessage(steve.getBody(), DamageSource.entity(steve.getBody())).parameters).toEqual(['Steve']);
        expect(deathMessage(steve.getBody(), DamageSource.entity(alex.getBody())).parameters).toEqual([
            'Steve',
            'Alex'
        ]);
    });
});
