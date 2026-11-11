import type { EntityPosition } from '@jsprismarine/entities';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';

import type { ContentOptions } from '../content/ContentOptions';
import type { DataEntity } from '../entity/data/DataEntity';
import { enterStore, StorePlayers } from '../entity/data/storePlayers';
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
