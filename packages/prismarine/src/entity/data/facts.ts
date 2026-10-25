/**
 * What an entity type is, read off its definition instead of off a table.
 *
 * `MobStats`, `EntitySize` and `ai/Speed` each wrote the same numbers out by
 * hand, once per species, because nothing in this repository carried them.
 * The content root carries them now: `minecraft:collision_box` is the hitbox,
 * the attribute components are the stats, `minecraft:loot` names the table and
 * `minecraft:type_family` names the families. This module is the one place
 * that reads them, so a figure is wrong in the pack or not at all.
 *
 * The attribute components write their values when a component initializes
 * rather than declaring them on the type, so the facts come from one throwaway
 * instance per type, built once and cached. That is also why the numbers here
 * are the base components' - a group an event adds later changes the live
 * entity's attributes and not the type's facts.
 */
import type { EntityType } from '@jsprismarine/entities';
import { EntityInstance, collisionBox, loot, typeFamily } from '@jsprismarine/entities';
import type { Registry } from '@jsprismarine/content';

/** A box centered on the entity's position, extending upwards from its feet. */
export interface EntityBox {
    /** Blocks across, on both horizontal axes. The entity reaches half of this either side. */
    readonly width: number;
    /** Blocks tall, measured up from the feet, which is where an entity's position is. */
    readonly height: number;
}

/**
 * Mojang's documented default for `minecraft:collision_box`.
 *
 * Used only for a type whose definition declares no collision box, which is
 * the same case the component's own default covers. A type the server has no
 * definition for gets no facts at all rather than this.
 *
 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_collision_box
 */
export const DEFAULT_BOX: EntityBox = { width: 1, height: 1 };

/**
 * The boxes of the two types the server models that no entity file declares.
 *
 * A dropped stack and a falling block are bodies the server makes rather than
 * types a pack describes, so Mojang's behavior pack ships no `item.json` and
 * no `falling_block.json` and the registry has nothing to read for either.
 * The numbers are Java's, which is also what the Bedrock client draws for the
 * two of them.
 *
 * Every other type comes from the registry. A row added here is a row the
 * content no longer owns, so the table is meant to stay two rows long.
 */
const UNDECLARED_BOXES: Readonly<Record<string, EntityBox>> = {
    'minecraft:item': { width: 0.25, height: 0.25 },
    'minecraft:falling_block': { width: 0.98, height: 0.98 }
};

/**
 * The hitbox of one entity type, from its `minecraft:collision_box`.
 *
 * The server collides bodies against the world with these numbers and the
 * client is told the same ones, so the hitbox it draws sits where the server
 * thinks the body is. They used to disagree: every entity announced itself as
 * the player's `0.6 x 1.8` while the server treated it as a point, so a sheep
 * walked half way into a wall before anything stopped it.
 *
 * @param registry - The entity types of the running content build.
 * @param identifier - The namespaced type, as `Entity.getType` reports it.
 * @returns The declared box, one of {@link UNDECLARED_BOXES}, or
 *   {@link DEFAULT_BOX} for a type nothing describes.
 */
export const boxOf = (registry: Registry<EntityType>, identifier: string): EntityBox =>
    registry.get(identifier)?.params(collisionBox) ?? UNDECLARED_BOXES[identifier] ?? DEFAULT_BOX;

/** Everything the server reads about an entity type that is a number or a name. */
export interface EntityFacts {
    /** The namespaced identifier, such as `minecraft:zombie`. */
    readonly identifier: string;
    /** The hitbox, from `minecraft:collision_box`. */
    readonly box: EntityBox;
    /** Maximum health, from `minecraft:health`. */
    readonly health: number;
    /** Half-hearts a plain melee hit is worth, from `minecraft:attack`. */
    readonly attackDamage: number;
    /** Nought to one, from `minecraft:knockback_resistance`. */
    readonly knockbackResistance: number;
    /** How far the entity notices things, from `minecraft:follow_range`. */
    readonly followRange: number;
    /**
     * The `minecraft:movement` value, in Bedrock's own movement units.
     *
     * Not blocks per second and not blocks per tick: it is the number the
     * client is told and the number every goal's `speed_multiplier` scales.
     * {@link blocksPerTick} converts it for the movement model.
     */
    readonly movement: number;
    /** The `minecraft:underwater_movement` value, or the walking one when the type declares none. */
    readonly underwaterMovement: number;
    /** The families `minecraft:type_family` declares, which is what `is_family` matches. */
    readonly families: readonly string[];
    /** The pack-relative loot table path from `minecraft:loot`, or undefined when it declares none. */
    readonly lootTable: string | undefined;
    /** Whether the type may be spawned by a spawn rule. */
    readonly spawnable: boolean;
    /** Whether `/summon` may create the type. */
    readonly summonable: boolean;
}

/**
 * Bedrock's `minecraft:movement` value as blocks per tick.
 *
 * Vanilla's cow carries `0.25` and walks a little under half a block a second,
 * which is the factor Java's `movement_speed` attribute uses for the same
 * number: a speed attribute is blocks per tick divided by this.
 */
const MOVEMENT_UNITS_PER_BLOCK_PER_TICK = 10;

/** One `minecraft:movement` value as the blocks per tick the movement model integrates. */
export const blocksPerTick = (movement: number): number => movement / MOVEMENT_UNITS_PER_BLOCK_PER_TICK;

/**
 * Reads the facts of every entity type in a registry, once.
 *
 * Deliberately a lookup over a registry rather than a free function over a
 * type: the facts are cached, and a content reload replaces the whole registry
 * and so the whole lookup, which is the rule the content root sets for
 * anything keyed by a positional id.
 */
export class EntityFactsLookup {
    private readonly cache = new Map<string, EntityFacts>();

    public constructor(private readonly registry: Registry<EntityType>) {}

    /** The identifiers the registry carries, in registry order. */
    public identifiers(): readonly string[] {
        return this.registry.keys();
    }

    /**
     * The facts of one type, or undefined when the content carries no such
     * entity. Nothing is guessed: a caller that gets undefined knows the pack
     * stack never declared the entity.
     */
    public get(identifier: string): EntityFacts | undefined {
        const cached = this.cache.get(identifier);
        if (cached !== undefined) return cached;

        const type = this.registry.get(identifier);
        if (type === undefined) return undefined;

        const facts = factsOf(this.registry, identifier, type);
        this.cache.set(identifier, facts);
        return facts;
    }
}

/** Reads one type's facts by building a throwaway instance for its attributes. */
const factsOf = (registry: Registry<EntityType>, identifier: string, type: EntityType): EntityFacts => {
    // The attribute components write when they initialize, so the base components have to run
    // once. The instance is thrown away: nothing ticks it and nothing puts it in the world.
    const probe = new EntityInstance(registry.holder(identifier));
    const attributes = probe.attributes;
    const movement = attributes.value('movement', 0);

    return {
        identifier,
        box: boxOf(registry, identifier),
        health: attributes.value('health', 0),
        attackDamage: attributes.value('attack_damage', 0),
        knockbackResistance: attributes.value('knockback_resistance', 0),
        followRange: attributes.value('follow_range', 0),
        movement,
        underwaterMovement: attributes.value('underwater_movement', movement),
        families: type.params(typeFamily)?.family ?? [],
        lootTable: type.params(loot)?.table,
        spawnable: type.flags.spawnable,
        summonable: type.flags.summonable
    };
};

/**
 * The Java loot table id for a Bedrock loot table path.
 *
 * `minecraft:loot` names a pack-relative file, `loot_tables/entities/cow.json`;
 * `ServerContent.loot` is Java's registry, keyed `minecraft:entities/cow`.
 * The two layouts line up exactly for the vanilla entity tables, which is why
 * this is a rewrite rather than a mapping table.
 *
 * @returns The id to roll, or undefined when the path is not a loot table path.
 */
export const javaLootIdOf = (table: string): string | undefined => {
    const match = /^(?:.*\/)?loot_tables\/(?<rest>.+?)(?:\.json)?$/.exec(table);
    const rest = match?.groups?.rest;
    return rest === undefined ? undefined : `minecraft:${rest}`;
};
