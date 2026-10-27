/**
 * What a mob leaves behind, rolled out of Java's loot tables.
 *
 * Bedrock does publish entity loot tables, which block drops have no
 * equivalent of, but reading mobs from one edition and blocks from the other
 * would be two answers to one question. Java's are the reference
 * [the plan](../../../../docs/plans/data-driven-vanilla.md) fixes, and they
 * are already loaded: the `ServerContent.loot` a breaking block rolls
 * through carries all 94 entity tables as well.
 *
 * What they buy over the fifty hand-written entries they replace is every
 * branch those entries could not state. Looting raises a count, a kill only
 * a player gets credit for unlocks the rare drops, a mob that died burning
 * drops its meat cooked, a sheep's wool is its own color, and the odds are
 * Java's rather than remembered.
 *
 * The one thing that has to be bridged is the name, exactly as in
 * {@link import('../block/blockLoot')}. A table is keyed by the Java entity
 * id and this server's mobs are Bedrock ones, so the index below is built
 * forward, from every `minecraft:entities/...` table the stack registered,
 * through `javaEntityTypeToBedrock`, back to the Bedrock identifier it lands
 * on - which is how a `minecraft:zombie_pigman` finds
 * `minecraft:entities/zombified_piglin`.
 */
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import type {
    DamageSource as PredicateDamageSource,
    EntityView,
    ItemStack as PredicateItemStack,
    LevelView,
    RandomSource,
    Vec3
} from '@jsprismarine/predicates';

import type { ContentItemDrop } from '../content/world/adapter';
import { bedrockEntityTypeTagsFor, javaEntityTypeTagsFor } from '../content/entityTypeTags';
import { bedrockItemDrops } from '../item/bedrockDrops';
import { dropOfRolledStack } from '../item/lootStack';
import type { ServerContent } from '../content/ServerContent';
import { DamageCause } from './DamageCause';

/** The prefix every Java entity loot table id carries. */
const ENTITY_TABLE_PREFIX = 'minecraft:entities/';

/** The type the credited-kill rules are written against. */
const PLAYER = 'minecraft:player';

/**
 * Bedrock identifier to Java entity loot table id, one index per content
 * build.
 *
 * Keyed weakly on the content so a reload drops it with the registries it
 * describes, and built on first use because a server where nothing dies
 * never pays for it.
 */
const indexes = new WeakMap<ServerContent, ReadonlyMap<string, string>>();

/** Walks every registered entity table once and records which Bedrock mob each one belongs to. */
const buildIndex = (content: ServerContent): ReadonlyMap<string, string> => {
    const index = new Map<string, string>();
    for (const id of content.loot.ids) {
        if (!id.startsWith(ENTITY_TABLE_PREFIX)) continue;

        // The sub-tables, `minecraft:entities/sheep/white` and the rest, name
        // no entity type and so fall out here. They are reached through the
        // species table that references them, which is where they belong.
        // So do the three Java mobs Bedrock has no entity for at all - the
        // giant, the illusioner and the mannequin.
        const mapped = javaEntityTypeToBedrock(`minecraft:${id.slice(ENTITY_TABLE_PREFIX.length)}`);
        if (mapped.kind !== 'mapped') continue;

        if (!index.has(mapped.bedrock)) index.set(mapped.bedrock, id);
    }
    return index;
};

/**
 * The Java loot table a Bedrock mob dies through.
 *
 * @returns The table id, or undefined for a mob the stack registered no
 *   table for, which is a Bedrock-only entity or a stack with no Java half.
 */
export const mobLootTableOf = (content: ServerContent, identifier: string): string | undefined => {
    let index = indexes.get(content);
    if (index === undefined) {
        index = buildIndex(content);
        indexes.set(content, index);
    }
    return index.get(identifier);
};

/**
 * What the entity predicates read about a mob beyond its type and where it
 * stood: the flags it carries, its data components and its per-type state.
 *
 * These decide real branches. A sheep's wool is keyed by its
 * `minecraft:sheep/color` component, a slime drops slime balls only at the
 * smallest size, and a mob that died burning drops its meat cooked. A table
 * rolled without them takes the other branch rather than failing, so the
 * mobs whose drops depend on one have to supply it.
 */
export type MobLootState = Omit<EntityView, 'type' | 'position'>;

/** What a death knows about itself, beyond the mob that died. */
export interface MobDropContext {
    /** Where it fell, which `origin` and the position predicates read. */
    readonly position?: Vec3;
    /** What this mob is, past its type; see {@link MobLootState}. */
    readonly self?: MobLootState;
    /** How it died and who is answerable. Build one with {@link lootDamageSource}. */
    readonly damage?: PredicateDamageSource;
    /** The world the clock and location conditions read. */
    readonly level?: LevelView;
    /** Replaces the table's own sequenced stream, for a test that wants a scripted draw. */
    readonly random?: RandomSource;
}

/** The origin a death with no position reported rolls against. */
const NOWHERE = { x: 0, y: 0, z: 0 } as const;

/**
 * The damage source for a death nothing is on record for, which the `entity`
 * context key set requires even so. Reported as Java's own catch-all rather
 * than left out, because a missing required parameter is an error on every
 * condition that reads it.
 */
const UNRECORDED: PredicateDamageSource = { type: 'minecraft:generic', tags: [] };

/**
 * Rolls what one mob leaves behind.
 *
 * @param identifier - The Bedrock entity identifier, as `Entity.getType` reports it.
 * @returns The stacks that fell, empty for a mob with no table - which is
 *   also the right answer for the wolves, cats and villagers Java gives an
 *   empty one.
 */
export const rollMobDrops = (
    content: ServerContent,
    identifier: string,
    context: MobDropContext = {}
): readonly ContentItemDrop[] => {
    const table = mobLootTableOf(content, identifier);
    if (table === undefined) return [];

    const origin = context.position ?? NOWHERE;
    const killer = context.damage?.sourceEntity;
    const javaIdentifier = `minecraft:${table.slice(ENTITY_TABLE_PREFIX.length)}`;

    const rolled = content.loot.roll(table, {
        parameterSet: 'entity',
        parameters: {
            // The predicates read Java entity names and the table id is the
            // Java name, so the mob goes in under that rather than under the
            // Bedrock identifier the server holds.
            this_entity: {
                ...context.self,
                type: javaIdentifier,
                typeTags: javaEntityTypeTagsFor(content.tags, javaIdentifier),
                position: origin
            },
            origin,
            damage_source: context.damage ?? UNRECORDED,
            attacking_entity: killer,
            direct_attacking_entity: context.damage?.directEntity ?? killer,
            // Java remembers the last player to hurt the mob for a hundred
            // ticks and credits the kill to them even if something else
            // landed the last blow. This server keeps only the blow that
            // killed it, so a player is credited by having landed that one.
            last_damage_player: killer?.type === PLAYER ? killer : undefined
        },
        level: context.level,
        random: context.random
    });

    // Java ids, because the table is Java's; `bedrockItemDrops` turns them into the names a
    // Bedrock client resolves.
    return bedrockItemDrops(rolled.map(dropOfRolledStack));
};

/**
 * Java's damage type for each cause this server models.
 *
 * Three causes are decided by who was behind them rather than by the cause
 * alone and are resolved in {@link damageTypeOf}; the rest are one to one.
 * `Contact` collapses Java's `cactus` and `sweet_berry_bush` into one cause,
 * and reads as the cactus.
 */
const DAMAGE_TYPES: Readonly<Record<DamageCause, string>> = {
    [DamageCause.Generic]: 'minecraft:generic',
    [DamageCause.Drowning]: 'minecraft:drown',
    [DamageCause.Starvation]: 'minecraft:starve',
    [DamageCause.Fall]: 'minecraft:fall',
    [DamageCause.Fire]: 'minecraft:on_fire',
    [DamageCause.Lava]: 'minecraft:lava',
    [DamageCause.Void]: 'minecraft:out_of_world',
    [DamageCause.Attack]: 'minecraft:mob_attack',
    [DamageCause.Projectile]: 'minecraft:mob_projectile',
    [DamageCause.Explosion]: 'minecraft:explosion',
    [DamageCause.Contact]: 'minecraft:cactus',
    [DamageCause.Suffocation]: 'minecraft:in_wall',
    [DamageCause.Magic]: 'minecraft:magic',
    [DamageCause.Wither]: 'minecraft:wither',
    [DamageCause.Thorns]: 'minecraft:thorns'
};

/**
 * The damage type a projectile carries, for the ones this server has
 * entities for. Anything else is a mob's projectile, which is Java's own
 * fallback for a thrown thing with no type of its own.
 */
const PROJECTILE_TYPES: Readonly<Record<string, string>> = {
    'minecraft:arrow': 'minecraft:arrow',
    'minecraft:thrown_trident': 'minecraft:trident',
    'minecraft:fireball': 'minecraft:fireball',
    'minecraft:small_fireball': 'minecraft:fireball'
};

/** The little of an entity the loot predicates read, so an `Entity` satisfies it as it is. */
export interface LootEntity {
    getType(): string;
    getPosition(): { getX(): number; getY(): number; getZ(): number };
    /**
     * The inventory, which only something humanlike has. `n` is what
     * `Human` calls it, and the optional member is what lets a plain
     * `Entity` - a skeleton, a cactus - satisfy this type without one.
     */
    n?(): { getItemInHand(): { asPredicateStack(): PredicateItemStack } };
}

/**
 * The little of a {@link import('./DamageSource').DamageSource} the loot
 * predicates read.
 *
 * Written structurally rather than against the class so a test can state a
 * kill without building two live entities to have it happen between.
 */
export interface LootKill {
    readonly cause: DamageCause;
    /** Whoever is answerable, which for a fired arrow is the archer. */
    readonly attacker: LootEntity | null;
    /** What made contact, when that is not the attacker. */
    readonly projectile: LootEntity | null;
}

/** The damage type for one hit, which for three of the causes depends on who was behind it. */
const damageTypeOf = (source: LootKill): string => {
    const byPlayer = source.attacker?.getType() === PLAYER;

    switch (source.cause) {
        case DamageCause.Attack:
            return byPlayer ? 'minecraft:player_attack' : 'minecraft:mob_attack';
        case DamageCause.Explosion:
            return byPlayer ? 'minecraft:player_explosion' : 'minecraft:explosion';
        case DamageCause.Projectile:
            return PROJECTILE_TYPES[source.projectile?.getType() ?? ''] ?? 'minecraft:mob_projectile';
        default:
            return DAMAGE_TYPES[source.cause];
    }
};

/** The `damage_type` tags of each type, resolved once per content build. */
const tagIndexes = new WeakMap<ServerContent, Map<string, readonly string[]>>();

/**
 * The tags one damage type carries, read off the stack's own
 * `tags/damage_type/` files rather than listed here. A turtle struck by
 * lightning and a ghast killed by its own fireball both turn on one.
 */
const damageTagsOf = (content: ServerContent, type: string): readonly string[] => {
    let index = tagIndexes.get(content);
    if (index === undefined) {
        index = new Map();
        tagIndexes.set(content, index);
    }

    const cached = index.get(type);
    if (cached !== undefined) return cached;

    const tags = content.tags.tags('damage_type').filter((tag) => content.tags.includes('damage_type', tag, type));
    index.set(type, tags);
    return tags;
};

/** One entity as the loot predicates read it: what it is, where it is, and what it holds. */
const lootEntityView = (entity: LootEntity | null | undefined, tags: ServerContent['tags']): EntityView | undefined => {
    if (!entity) return undefined;

    const at = entity.getPosition();
    const held = entity.n?.().getItemInHand();

    return {
        type: entity.getType(),
        typeTags: bedrockEntityTypeTagsFor(tags, entity.getType()),
        position: { x: at.getX(), y: at.getY(), z: at.getZ() },
        // The looting bonus is read off the killer's main hand, so an empty
        // hand has to be an empty `equipment` rather than an absent one: an
        // absent one reads as "this host cannot say" and reports.
        equipment: held ? { mainhand: held.asPredicateStack() } : {}
    };
};

/**
 * The kill as the damage-source predicates read it.
 *
 * @param content - The content build, for its `damage_type` tags.
 * @param source - What killed the mob, or null when nothing is on record.
 * @returns The source, or undefined for a death with no record, which rolls
 *   against {@link UNRECORDED}.
 */
export const lootDamageSource = (
    content: ServerContent,
    source: LootKill | null | undefined
): PredicateDamageSource | undefined => {
    if (!source) return undefined;

    const type = damageTypeOf(source);
    const attacker = lootEntityView(source.attacker, content.tags);
    const projectile = lootEntityView(source.projectile, content.tags);

    return {
        type,
        tags: damageTagsOf(content, type),
        sourceEntity: attacker,
        // The arrow rather than the archer, and the archer again when there
        // was no arrow: Java's direct entity is whatever made contact.
        directEntity: projectile ?? attacker,
        position: projectile?.position ?? attacker?.position
    };
};
