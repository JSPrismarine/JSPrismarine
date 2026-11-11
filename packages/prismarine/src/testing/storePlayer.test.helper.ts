import type { EntityPosition } from '@jsprismarine/entities';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';

import Player from '../Player';
import { entityIds } from '../entity/entityIds';
import { PlayerComponents } from '../entity/playerComponents';
import { EYE_HEIGHT } from '../entity/playerEyes';
import type { Position } from '../world/Position';
import type { StubMembers } from './stub.test.helper';

import type { ContentOptions } from '../content/ContentOptions';
import type { DataEntity } from '../entity/data/DataEntity';
import { enterStore, StorePlayerActor, StorePlayers } from '../entity/data/storePlayers';
import type { EntityFixture, TestEntityWorld } from '../entity/data/testing';
import { entityFixture, FLOOR_Y } from '../entity/data/testing';
import { PLAYER_IDENTIFIER } from '../entity/playerOverlay';
import { StorePlayer } from '../entity/storePlayer';
import type { StorePlayerIdentity } from '../entity/storePlayer';
import type { ChangeEntry } from '../world/changelog/ChangeEntry';

/**
 * The parts of the shipped `entities/player.json` the store's player rules read: no
 * `minecraft:health`, which the overlay adds, and the shipped breath.
 */
export const SHIPPED_PLAYER = {
    components: {
        'minecraft:collision_box': { width: 0.6, height: 1.8 },
        'minecraft:type_family': { family: ['player'] },
        'minecraft:loot': { table: 'loot_tables/empty.json' },
        'minecraft:movement': { value: 0.1 },
        'minecraft:physics': { push_towards_closest_space: true },
        'minecraft:breathable': { total_supply: 15, suffocate_time: -1, inhale_time: 3.75, generates_bubbles: false }
    }
};

/** A runtime whose content holds the shipped player beside the fixture's mobs. */
export const storePlayerFixture = (world?: TestEntityWorld, overrides: ContentOptions = {}): EntityFixture =>
    entityFixture(world, overrides, { [PLAYER_IDENTIFIER]: SHIPPED_PLAYER });

/** Where a fixture's store player stands unless a test says otherwise: on the floor. */
export const STORE_PLAYER_FEET: EntityPosition = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A store player in no store yet, under an id from the fixture's pool, as a login builds one. */
export const loggedInStorePlayer = (
    fixture: Pick<EntityFixture, 'runtime'>,
    identity: StorePlayerIdentity = { uuid: UUID.fromRandom(), name: 'Steve', xuid: '' },
    feet: EntityPosition = STORE_PLAYER_FEET
): StorePlayer => {
    const player = new StorePlayer(fixture.runtime.nextEntityId(), identity);
    player.standAt(feet);
    return player;
};

/** A store player whose entity has entered the fixture's store. */
export const enteredStorePlayer = (
    fixture: Pick<EntityFixture, 'runtime'>,
    identity?: StorePlayerIdentity,
    players = new StorePlayers()
): { readonly player: StorePlayer; readonly entity: DataEntity } => {
    const player = loggedInStorePlayer(fixture, identity);
    const entity = enterStore(fixture.runtime, players, player);
    if (entity === undefined) throw new Error('the fixture declares no player');
    return { player, entity };
};

/** Runs `work` inside one tick of the store's log and returns what it appended. */
export const logged = (runtime: EntityFixture['runtime'], work: () => void): readonly ChangeEntry[] => {
    runtime.store.beginTick();
    work();
    return runtime.store.sealTick()?.entries ?? [];
};

/** The entity field entries among `entries` that write `field`. */
export const fieldsOf = (entries: readonly ChangeEntry[], field: string): readonly ChangeEntry[] =>
    entries.filter((entry) => entry.kind === 'field' && entry.field === 'entity' && entry.address.field === field);

/**
 * A player double built from `Player.prototype` without its constructor, over a real
 * {@link StorePlayer} in no store, which holds the inventory, the components and the attribute
 * table a constructed player reads. Its writes reach no change log.
 *
 * @param members - What the player answers, as `stubOf` takes it, each set on the double itself so
 *   it shadows the prototype's accessor or method of that name.
 * @param placed - The entity id the store player is filed by, from the shared pool unless given;
 *   where its eyes are, which also names its world; and, for a test that hands the player to
 *   entity code, what its actor answers. The actor is a `StorePlayerActor` double the player
 *   answers `getActor` and `getBody` with, which reports the player's id and type, faces north and whose `player` is the store player.
 * @returns The player.
 */
export const playerOnPrototype = (
    members: StubMembers<Player> = {},
    placed: {
        readonly runtimeId?: bigint;
        readonly position?: Position;
        readonly actor?: StubMembers<StorePlayerActor>;
    } = {}
): Player => {
    // The double's own name and identity, when it answers them, so its actor agrees.
    const store = new StorePlayer(placed.runtimeId === undefined ? entityIds.next() : Number(placed.runtimeId), {
        uuid: members.getUUID?.() ?? UUID.fromRandom(),
        name: members.getName?.() ?? 'Steve',
        xuid: ''
    });
    const player: Player = Object.create(Player.prototype);
    Object.defineProperty(player, 'store', { value: store });
    const { position } = placed;
    if (position !== undefined) {
        store.standAt({ x: position.getX(), y: position.getY() - EYE_HEIGHT, z: position.getZ() });
        Object.defineProperty(player, 'world', { value: position.getWorld(), writable: true });
    }
    if (placed.actor !== undefined) {
        const actor: StorePlayerActor = Object.create(StorePlayerActor.prototype);
        definedOn(actor, {
            player: store,
            getRuntimeId: () => BigInt(store.id),
            getType: () => PLAYER_IDENTIFIER,
            yaw: 0,
            pitch: 0,
            headYaw: 0,
            ...placed.actor
        });
        Object.defineProperty(player, 'getActor', { value: () => actor, writable: true });
        Object.defineProperty(player, 'getBody', { value: () => actor, writable: true });
    }
    definedOn(player, members);
    return player;
};

/** Sets each member on a double as its own property, so it shadows the prototype's accessor of that name. */
const definedOn = (target: object, members: object): void => {
    for (const [name, value] of Object.entries(members))
        Object.defineProperty(target, name, { value, writable: true, configurable: true });
};

/**
 * The experience a plain player stub answers `getExperience` with, kept in `attributes` as a
 * store player keeps it.
 */
export const experienceIn = (attributes: Attributes) => new PlayerComponents(attributes, () => {}).experience();
