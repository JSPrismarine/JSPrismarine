import type { ContentOptions } from '../content/ContentOptions';
import type { EntityFixture, TestEntityWorld } from '../entity/data/testing';
import { entityFixture } from '../entity/data/testing';
import { PLAYER_IDENTIFIER } from '../entity/playerOverlay';
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

/** Runs `work` inside one tick of the store's log and returns what it appended. */
export const logged = (runtime: EntityFixture['runtime'], work: () => void): readonly ChangeEntry[] => {
    runtime.store.beginTick();
    work();
    return runtime.store.sealTick()?.entries ?? [];
};

/** The entity field entries among `entries` that write `field`. */
export const fieldsOf = (entries: readonly ChangeEntry[], field: string): readonly ChangeEntry[] =>
    entries.filter((entry) => entry.kind === 'field' && entry.field === 'entity' && entry.address.field === field);
