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
 * rather than declaring them on the type, so the type's facts come from one
 * throwaway instance per type, built once and cached by
 * {@link EntityFactsLookup}.
 *
 * Those numbers are the base components' alone, and most of them are wrong for
 * a live entity: of the 128 vanilla definitions, 15 declare
 * `minecraft:movement` only inside a component group, 18 do the same with
 * `minecraft:attack`, 29 with `minecraft:loot` and five with
 * `minecraft:health`, so the type-level read finds nothing and the zombie, the
 * slime and the skeleton come out with a speed, a loot table and a melee hit
 * of zero. {@link liveFactsOf} is the answer: it reads whatever the entity's
 * active components say now and falls back to the type's figure, so a group a
 * spawn event adds counts.
 */
import type { EntityType } from '@jsprismarine/entities';
import { DEFAULT_UNDERWATER_MOVEMENT, EntityInstance, collisionBox, loot, typeFamily } from '@jsprismarine/entities';
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

/**
 * Everything the server reads about an entity that is a number or a name.
 *
 * Read off a type by {@link EntityFactsLookup}, which answers for the base
 * components, and off a live entity by {@link liveFactsOf}, which answers for
 * the components active now. Prefer the live reading anywhere an entity is to
 * hand: the type's figures are a fallback, and for a mob that keeps its stats
 * in a component group they are zero.
 */
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
     * The live movement controller uses this as its per-tick path speed. Keep
     * the raw component value so groups can change it while the entity is alive.
     */
    readonly movement: number;
    /** The active `minecraft:underwater_movement` value, or its component default when absent. */
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
 * Reads the facts of every entity type in a registry, once.
 *
 * Deliberately a lookup over a registry rather than a free function over a
 * type: the facts are cached, and a content reload replaces the whole registry
 * and so the whole lookup, which is the rule the content root sets for
 * anything keyed by a positional id.
 *
 * What a type declares in its base components, which is what a caller holding
 * no entity can know. Wrap the answer in {@link liveFactsOf} wherever there is
 * an entity to read instead.
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
        underwaterMovement: attributes.value('underwater_movement', DEFAULT_UNDERWATER_MOVEMENT),
        families: type.params(typeFamily)?.family ?? [],
        lootTable: type.params(loot)?.table,
        spawnable: type.flags.spawnable,
        summonable: type.flags.summonable
    };
};

/**
 * One entity's facts as its active components make them now.
 *
 * Every member reads through to the component state on each access, so a
 * component group a spawn event adds, a stat a damage effect moves and a
 * `minecraft:loot` that only exists on an adult all count the tick they
 * happen. Accessors rather than a snapshot because a snapshot is a copy that
 * goes stale, and the stale copy is the bug this replaces: every goal's walk
 * scaled a `minecraft:movement` frozen at spawn, which was zero for the
 * fifteen types that declare it in a group, so the zombie stood still.
 *
 * The type's facts stay underneath as the fallback, for the attributes no
 * active component declares.
 */
class LiveFacts implements EntityFacts {
    public constructor(
        private readonly type: EntityFacts,
        private readonly instance: EntityInstance
    ) {}

    public get identifier(): string {
        return this.type.identifier;
    }

    public get box(): EntityBox {
        return activeBox(this.instance) ?? this.type.box;
    }

    /**
     * The maximum, which is the component's `max`, and not the health left.
     *
     * `Attributes.value` would answer with the current health, and this is the
     * number a brain's `max_health` and a health bar divide by.
     */
    public get health(): number {
        return this.instance.attributes.get('health')?.max ?? this.type.health;
    }

    public get attackDamage(): number {
        return this.instance.attributes.value('attack_damage', this.type.attackDamage);
    }

    public get knockbackResistance(): number {
        return this.instance.attributes.value('knockback_resistance', this.type.knockbackResistance);
    }

    public get followRange(): number {
        return this.instance.attributes.value('follow_range', this.type.followRange);
    }

    public get movement(): number {
        return this.instance.attributes.value('movement', this.type.movement);
    }

    public get underwaterMovement(): number {
        return this.instance.attributes.value('underwater_movement', this.type.underwaterMovement);
    }

    public get families(): readonly string[] {
        const active = this.instance.families();
        return active.length > 0 ? active : this.type.families;
    }

    public get lootTable(): string | undefined {
        return this.instance.lootTable() ?? this.type.lootTable;
    }

    public get spawnable(): boolean {
        return this.type.spawnable;
    }

    public get summonable(): boolean {
        return this.type.summonable;
    }
}

/**
 * The hitbox of the active `minecraft:collision_box`, when one is active.
 *
 * `EntityInstance.componentParams` hands back what the component's schema
 * parsed, which for this component is already a width and a height; the checks
 * are what stands in for the type the untyped accessor cannot give back.
 *
 * @returns The box, or undefined when no active component declares one.
 */
const activeBox = (instance: EntityInstance): EntityBox | undefined => {
    const params = instance.componentParams('minecraft:collision_box');
    if (params === null || typeof params !== 'object') return undefined;
    if (!('width' in params) || !('height' in params)) return undefined;
    const { width, height } = params;
    return typeof width === 'number' && typeof height === 'number' ? { width, height } : undefined;
};

/**
 * The facts of one live entity, reading through to its components.
 *
 * @param type - The type's facts, from {@link EntityFactsLookup}, which every
 *   member falls back to.
 * @param instance - The entity's component state.
 */
export const liveFactsOf = (type: EntityFacts, instance: EntityInstance): EntityFacts => new LiveFacts(type, instance);

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
