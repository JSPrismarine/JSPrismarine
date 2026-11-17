/**
 * The ominous item spawner, as an entity of the store, transcribed from Java 26.3's
 * `OminousItemSpawner`.
 *
 * Bedrock's file for `minecraft:ominous_item_spawner` declares no components, so a spawner the
 * ominous trial spawner left in the air held its item forever. The entity overlay's definition
 * supplies `jsprismarine:ominous_item_spawner` with Java's numbers. A spawner draws the tick it
 * lets go on, from 60 to 120 as Java's `create` does, plays the about-to-spawn sound 36 ticks
 * before, and on the tick releases its item and is gone: an item Java fires as a projectile,
 * such as an arrow, flies straight down at its dispense power, and any other item drops.
 *
 * The ticks it has lived and the tick it lets go on are component state, so every write is logged
 * and an update that throws is undone.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { ContentItemDrop } from '../../content/world/adapter';
import type { DataEntity } from './DataEntity';
import { PrismarineEntityErrors } from '@jsprismarine/errors/prismarine/entity';

/** The host component that makes a data entity an ominous item spawner, and holds its numbers. */
export const OMINOUS_ITEM_SPAWNER_COMPONENT = 'jsprismarine:ominous_item_spawner';

/** The sound Java's spawner plays as it is about to let its item go. */
const ABOUT_TO_SPAWN_SOUND = 'ominous_item_spawner.about_to_spawn_item';

/** The sound Java's spawner plays as the item goes. */
const SPAWN_SOUND = 'ominous_item_spawner.spawn_item';

/**
 * The items Java's spawner fires rather than drops, the `ProjectileItem`s, with the Bedrock entity
 * each flies as and its `DispenseConfig`: a power of 1.1 and 6 degrees of spread by default, and
 * 1.375 and 3 for the thrown potions and the bottle o' enchanting.
 */
const PROJECTILES: ReadonlyMap<string, ProjectileRelease> = new Map(
    (
        [
            ['minecraft:arrow', 'minecraft:arrow'],
            ['minecraft:spectral_arrow', 'minecraft:arrow'],
            ['minecraft:tipped_arrow', 'minecraft:arrow'],
            ['minecraft:snowball', 'minecraft:snowball'],
            ['minecraft:egg', 'minecraft:egg'],
            ['minecraft:wind_charge', 'minecraft:wind_charge_projectile'],
            ['minecraft:fire_charge', 'minecraft:small_fireball']
        ] as const
    )
        .map(([item, entity]): readonly [string, ProjectileRelease] => [item, { entity, power: 1.1, spread: 6 }])
        .concat(
            (
                [
                    ['minecraft:splash_potion', 'minecraft:splash_potion'],
                    ['minecraft:lingering_potion', 'minecraft:lingering_potion'],
                    ['minecraft:experience_bottle', 'minecraft:xp_bottle']
                ] as const
            ).map(([item, entity]): readonly [string, ProjectileRelease] => [item, { entity, power: 1.375, spread: 3 }])
        )
);

/** How a projectile item leaves a spawner. */
interface ProjectileRelease {
    /** The Bedrock entity it flies as. */
    readonly entity: string;
    /** Its launch speed, in blocks per tick. */
    readonly power: number;
    /** Its spread, in degrees. */
    readonly spread: number;
}

/** One spawner's state: how many ticks it has lived, and the tick it lets its item go on. */
export const ominousSpawnerState = defineComponentState(OMINOUS_ITEM_SPAWNER_COMPONENT, {
    age: stateField.number,
    releaseAt: stateField.number
});

/** The numbers of `jsprismarine:ominous_item_spawner`. */
export interface OminousSpawnerTuning {
    /** The earliest tick the item goes, Java's `SPAWN_ITEM_DELAY_MIN`. */
    readonly minDelay: number;
    /** The latest, Java's `SPAWN_ITEM_DELAY_MAX`. */
    readonly maxDelay: number;
    /** How many ticks before the release the warning sound plays, Java's `TICKS_BEFORE_ABOUT_TO_SPAWN_SOUND`. */
    readonly soundLead: number;
}

/**
 * The numbers a spawner's definition declares.
 * @throws {TypeError} When the component leaves a number out, which fails the update that asked.
 */
export const ominousSpawnerTuningOf = (entity: DataEntity): OminousSpawnerTuning => {
    const params = entity.instance.componentParams(OMINOUS_ITEM_SPAWNER_COMPONENT);
    if (!isRecord(params))
        throw new PrismarineEntityErrors.MissingItemComponent({
            identifier: entity.identifier,
            itemComponent: OMINOUS_ITEM_SPAWNER_COMPONENT
        });
    const number = (key: string): number => {
        const value = params[key];
        if (typeof value !== 'number')
            throw new PrismarineEntityErrors.ItemComponentFieldNotNumber({
                itemComponent: OMINOUS_ITEM_SPAWNER_COMPONENT,
                key
            });
        return value;
    };
    return { minDelay: number('min_delay'), maxDelay: number('max_delay'), soundLead: number('sound_lead') };
};

/** Whether a data entity is an ominous item spawner this system runs. */
export const isOminousItemSpawner = (entity: DataEntity): boolean =>
    entity.instance.hasComponent(OMINOUS_ITEM_SPAWNER_COMPONENT);

/** The item a spawner holds, from the `item` its spawn data names, or undefined when it holds none. */
export const heldItemOf = (entity: DataEntity): ContentItemDrop | undefined => {
    const item = entity.spawnData?.['item'];
    if (!isRecord(item)) return undefined;
    const name = item['name'] ?? item['identifier'];
    if (typeof name !== 'string') return undefined;
    const count = typeof item['count'] === 'number' && item['count'] > 0 ? item['count'] : 1;
    return { identifier: name.includes(':') ? name : `minecraft:${name}`, count };
};

/** What the spawner needs of the runtime. */
export interface OminousItemSpawnerHost {
    /** A whole number in `[0, bound)` from the world's random source. */
    randomInt(bound: number): number;
    /** Launches a projectile entity straight down, answerable to `owner`. */
    fire(identifier: string, at: EntityPosition, speed: number, spread: number, owner: number): void;
    /** Drops an item stack at a position. */
    drop(at: EntityPosition, item: ContentItemDrop): void;
    playSound(at: EntityPosition, sound: string): void;
    remove(id: number, reason: string): void;
}

/** Runs every ominous item spawner in the store. */
export class OminousItemSpawners {
    public constructor(private readonly host: OminousItemSpawnerHost) {}

    /** One tick of one spawner: a tick older, the warning, and on its tick the release and the discard. */
    public update(entity: DataEntity): void {
        const tuning = ominousSpawnerTuningOf(entity);
        const state = entity.instance.componentState.get(ominousSpawnerState);
        const releaseAt =
            state === undefined || state.releaseAt <= 0
                ? tuning.minDelay + this.host.randomInt(tuning.maxDelay - tuning.minDelay + 1)
                : state.releaseAt;
        const age = (state?.age ?? 0) + 1;
        entity.instance.componentState.set(ominousSpawnerState, { age, releaseAt });

        if (age === releaseAt - tuning.soundLead) this.host.playSound(entity.position, ABOUT_TO_SPAWN_SOUND);
        if (age < releaseAt) return;
        this.release(entity);
        this.host.playSound(entity.position, SPAWN_SOUND);
        this.host.remove(entity.id, 'discarded');
    }

    /** Lets the held item go: Java's `spawnItem`, which fires a projectile item downward and drops the rest. */
    private release(entity: DataEntity): void {
        const item = heldItemOf(entity);
        if (item === undefined) return;
        const projectile = PROJECTILES.get(item.identifier);
        if (projectile === undefined) {
            this.host.drop(entity.position, item);
            return;
        }
        this.host.fire(projectile.entity, entity.position, projectile.power, projectile.spread, entity.id);
    }
}
