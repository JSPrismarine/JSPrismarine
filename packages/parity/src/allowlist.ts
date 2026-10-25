// The loss list is imported through its own module rather than the package index, because
// `scripts/dashboard.ts` runs under plain node, and the index re-exports its siblings without
// file extensions. `lossList.ts` imports nothing, so node and NodeNext both resolve it.
import {
    BLOCK_LOSSES,
    BLOCK_MERGES,
    ENTITY_LOSSES,
    ENTITY_MERGES,
    ITEM_LOSSES,
    ITEM_MERGES,
    REGISTRY_LOSSES
} from '@jsprismarine/mapping/lossList';

import type { Family } from './families.ts';

/** Why a comparison is allowed to report a gap. */
export type GapKind =
    /**
     * The gap is correct behavior. Bedrock has no concept for the Java value, or the project
     * decided against Java's rule for a reason written down in the research.
     */
    | 'accepted'
    /**
     * The gap is a defect this suite found and nobody has fixed. The row is not green; the
     * dashboard counts these separately so a defect cannot pass for an accepted gap.
     */
    | 'defect';

/**
 * One expected gap: a comparison the suite knows fails today, with the reason it is allowed
 * to and where that reason is written down.
 */
export interface AllowListEntry {
    /** The family whose comparison produces the gap. */
    family: Family;
    /** The gap id the comparison reports, for example `minecraft:zombie` or `item:minecraft:spear`. */
    id: string;
    /** Whether the gap is correct behavior or an unfixed defect. */
    kind: GapKind;
    /** Why the gap is expected rather than a defect, or what the defect is. */
    reason: string;
    /** A research note section or issue that records the gap, for example `docs/research/edition-behavior-differences.md section 2`. */
    reference: string;
}

/**
 * The reviewed losses of `@jsprismarine/mapping`, as allow-list rows.
 *
 * Plan section 5 requires every mapping loss to be an allow-list row with a reason, counted on
 * the dashboard. The rows come from the loss list itself rather than a second copy here, so a
 * loss that lands in `@jsprismarine/mapping` lands on the dashboard in the same change.
 */
const mappingLossEntries = (): readonly AllowListEntry[] => [
    ...BLOCK_LOSSES.map((loss) => ({
        family: 'mapping.blocks' as const,
        id: `loss:${loss.javaId}`,
        kind: 'accepted' as const,
        reason: loss.reason,
        reference: loss.reference
    })),
    ...BLOCK_MERGES.map((merge) => ({
        family: 'mapping.blocks' as const,
        id: `merge:${merge.bedrockId}`,
        kind: 'accepted' as const,
        reason: merge.reason,
        reference: merge.reference
    })),
    ...ITEM_LOSSES.map((loss) => ({
        family: 'mapping.items' as const,
        id: `loss:${loss.javaId}`,
        kind: 'accepted' as const,
        reason: loss.reason,
        reference: loss.reference
    })),
    ...ITEM_LOSSES.map((loss) => ({
        family: 'items.components' as const,
        id: `loss:${loss.javaId}`,
        kind: 'accepted' as const,
        reason: `${loss.reason} The item type table carries no row for it, so it has no Java components.`,
        reference: loss.reference
    })),
    ...ITEM_MERGES.map((merge) => ({
        family: 'mapping.items' as const,
        id: `merge:${merge.bedrockId}`,
        kind: 'accepted' as const,
        reason: merge.recovery,
        reference: merge.reference
    })),
    ...ENTITY_LOSSES.map((loss) => ({
        family: 'mapping.entities' as const,
        id: `loss:${loss.javaId}`,
        kind: 'accepted' as const,
        reason: loss.reason,
        reference: loss.reference
    })),
    ...ENTITY_MERGES.map((merge) => ({
        family: 'mapping.entities' as const,
        id: `merge:${merge.bedrockId}`,
        kind: 'accepted' as const,
        reason: merge.recovery,
        reference: merge.reference
    })),
    ...REGISTRY_LOSSES.map((loss) => ({
        family: 'mapping.registries' as const,
        id: `loss:${loss.registry}/${loss.javaId}`,
        kind: 'accepted' as const,
        reason: loss.reason,
        reference: loss.reference
    }))
];

/**
 * The mobs whose health neither edition reads off the attribute base.
 *
 * Java's supplier gives a horse 53 and then draws its real health between 15 and 30 at spawn;
 * Bedrock writes the same draw as a range in the entity file. Comparing the two bases compares
 * two numbers no horse ever has.
 */
const randomizedHealthEntries = (): readonly AllowListEntry[] =>
    ['minecraft:donkey', 'minecraft:horse', 'minecraft:llama', 'minecraft:mule', 'minecraft:trader_llama'].map(
        (bedrockId) => ({
            family: 'entities.stats' as const,
            id: `health:${bedrockId}`,
            kind: 'accepted' as const,
            reason: 'Both editions draw the health of a horse-like mob at spawn, so neither base is its health.',
            reference: 'bedrock-samples 1.26.50.4 entities/horse.json, which writes the draw as a range'
        })
    );

/**
 * The mobs whose health follows their size, written as one component group per size.
 *
 * Spawning the type picks one group, so the comparison sees that group's health against Java's
 * single supplier base. Java computes the same health from the size at spawn instead.
 */
const sizedHealthEntries = (): readonly AllowListEntry[] =>
    ['minecraft:magma_cube', 'minecraft:slime', 'minecraft:sulfur_cube'].map((bedrockId) => ({
        family: 'entities.stats' as const,
        id: `health:${bedrockId}`,
        kind: 'accepted' as const,
        reason: 'Health follows the size in both editions; Bedrock writes one component group per size.',
        reference: 'bedrock-samples 1.26.50.4 entities/slime.json, which declares 16, 4 and 1'
    }));

/**
 * Advertised actor types Mojang's behavior pack defines no entity file for.
 *
 * Five are engine entities whose behavior is code in both editions, and three are Education
 * Edition content that plan section 12 puts out of scope. The elder guardian ghost is the
 * curse effect the client draws, with no server-side body at all.
 */
const engineActorEntries = (): readonly AllowListEntry[] =>
    (
        [
            ['minecraft:item', 'A dropped item stack is an engine entity in both editions.'],
            ['minecraft:falling_block', 'A falling block is an engine entity in both editions.'],
            ['minecraft:painting', 'A painting is an engine entity in both editions.'],
            ['minecraft:leash_knot', 'A leash knot is an engine entity in both editions.'],
            ['minecraft:evocation_fang', "The evoker's fang is an engine entity with no definition."],
            ['minecraft:balloon', 'Education Edition content, which plan section 12 puts out of scope.'],
            ['minecraft:agent', 'Education Edition content, which plan section 12 puts out of scope.'],
            ['minecraft:ice_bomb', 'Education Edition content, which plan section 12 puts out of scope.'],
            ['minecraft:elder_guardian_ghost', 'The curse effect the client draws, with no server-side body.']
        ] as const
    ).map(([id, reason]) => ({
        family: 'entities.addactor' as const,
        id: `no-definition:${id}`,
        kind: 'accepted' as const,
        reason,
        reference: 'bedrock-samples 1.26.50.4 behavior_pack/entities, which has no file for it'
    }));

/** Advertised actor types whose definition declares no collision box at the top level. */
const bodilessActorEntries = (): readonly AllowListEntry[] =>
    (
        [
            ['minecraft:lightning_bolt', 'A lightning bolt has no body; the client draws the bolt.'],
            ['minecraft:area_effect_cloud', 'A lingering potion cloud has no body an entity collides with.'],
            ['minecraft:ominous_item_spawner', 'The trial spawner projectile has no body.'],
            ['minecraft:shulker', "The shulker's box grows and shrinks, so its collision box is in a component group."]
        ] as const
    ).map(([id, reason]) => ({
        family: 'entities.addactor' as const,
        id: `no-collision-box:${id}`,
        kind: 'accepted' as const,
        reason,
        reference: 'bedrock-samples 1.26.50.4 behavior_pack/entities'
    }));

/**
 * Every expected gap the suite carries. Entries land here when a comparison starts failing for
 * a reason the project accepts, and leave when the gap closes - `checkAllowList` fails the
 * suite in both directions, so this list can neither hide a new gap nor go stale.
 */
export const allowList: readonly AllowListEntry[] = [
    // Four actor types keep a legacy id in `entity_identifiers` while their spawn egg item uses
    // the modern name, so `<actor id>_spawn_egg` finds no item. Vanilla behaves the same way;
    // the egg exists under the renamed id.
    {
        family: 'registry.entities',
        id: 'spawn-egg:minecraft:evocation_illager',
        kind: 'accepted',
        reason: 'The actor keeps the legacy id; the egg item is minecraft:evoker_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    },
    {
        family: 'registry.entities',
        id: 'spawn-egg:minecraft:tropicalfish',
        kind: 'accepted',
        reason: 'The actor keeps the legacy id; the egg item is minecraft:tropical_fish_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    },
    {
        family: 'registry.entities',
        id: 'spawn-egg:minecraft:villager_v2',
        kind: 'accepted',
        reason: 'The actor keeps the legacy _v2 id; the egg item is minecraft:villager_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    },
    {
        family: 'registry.entities',
        id: 'spawn-egg:minecraft:zombie_villager_v2',
        kind: 'accepted',
        reason: 'The actor keeps the legacy _v2 id; the egg item is minecraft:zombie_villager_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    },

    // Bedrock has one piston block where Java has a retracted and an extended one, so the
    // property table's generator had to keep one of the two light dampening values and kept
    // the extended piston's 0. A Bedrock piston is retracted unless it is firing, and Java
    // gives the retracted piston 15, so every piston in a world lets light through that should
    // not. The fix belongs in the generator, which should keep the value of the Java state
    // whose dropped properties are at their defaults.
    {
        family: 'blocks.properties',
        id: 'minecraft:piston#lightDampening',
        kind: 'defect',
        reason: "The table keeps the extended piston's 0; Java gives the retracted piston 15.",
        reference: 'docs/research/java-to-bedrock-translation.md section 2, the `extended` row'
    },
    {
        family: 'blocks.properties',
        id: 'minecraft:sticky_piston#lightDampening',
        kind: 'defect',
        reason: "The table keeps the extended piston's 0; Java gives the retracted piston 15.",
        reference: 'docs/research/java-to-bedrock-translation.md section 2, the `extended` row'
    },

    // Two vanilla recipes make an item Bedrock has no identifier for, so the recipe compiles
    // onto the fallback item the reviewed item loss names. The loss is in `ITEM_LOSSES`; these
    // rows record that a recipe carries it, which is what a player would see in the book.
    {
        family: 'recipes.registry',
        id: 'loss:minecraft:furnace_minecart',
        kind: 'accepted',
        reason: 'Bedrock has no furnace minecart item, so the recipe makes the listed fallback.',
        reference: 'docs/research/java-to-bedrock-translation.md section 3'
    },
    {
        family: 'recipes.registry',
        id: 'loss:minecraft:spectral_arrow',
        kind: 'accepted',
        reason: 'Bedrock has no spectral arrow, so the recipe makes a plain arrow.',
        reference: 'docs/research/java-to-bedrock-translation.md section 3'
    },

    ...engineActorEntries(),
    ...bodilessActorEntries(),
    ...randomizedHealthEntries(),
    ...sizedHealthEntries(),
    {
        family: 'entities.stats',
        id: 'no-health:minecraft:player',
        kind: 'accepted',
        reason: "Mojang's player.json declares no health component; the server owns a player's health.",
        reference: 'bedrock-samples 1.26.50.4 entities/player.json'
    },
    {
        family: 'entities.stats',
        id: 'health:minecraft:armor_stand',
        kind: 'defect',
        reason: "Bedrock's armor stand has 6 health where Java's has 20. The amount of damage an armor stand takes is server-decided and invisible, so the claim covers it and the row should take Java's value.",
        reference: 'docs/research/edition-behavior-differences.md section 13'
    },
    {
        family: 'entities.stats',
        id: 'health:minecraft:wither',
        kind: 'defect',
        reason: "Bedrock's wither has 600 health where Java's has 300. Boss health is server-decided, so the claim covers it and the row should take Java's value.",
        reference: 'docs/research/edition-behavior-differences.md section 13'
    },

    ...mappingLossEntries()
];

/** The allow-listed gap ids for one family. */
export const allowedIds = (family: Family, entries: readonly AllowListEntry[] = allowList): Set<string> =>
    new Set(entries.filter((entry) => entry.family === family).map((entry) => entry.id));

/** What `checkAllowList` found: gaps the list does not cover, and entries that no longer gap. */
export interface AllowListVerdict {
    /** Gap ids the comparison reported that have no allow-list entry. These fail the family's test. */
    unexpected: string[];
    /** Allow-listed ids the comparison no longer reports. A stale entry fails the family's test too. */
    stale: string[];
}

/**
 * Splits a comparison's gaps against the allow list. A family's test asserts both halves are
 * empty: `unexpected` catches a new gap, `stale` catches an entry that started passing.
 */
export const checkAllowList = (
    family: Family,
    gaps: readonly string[],
    entries: readonly AllowListEntry[] = allowList
): AllowListVerdict => {
    const allowed = allowedIds(family, entries);
    const reported = new Set(gaps);

    return {
        unexpected: gaps.filter((id) => !allowed.has(id)),
        stale: [...allowed].filter((id) => !reported.has(id))
    };
};
