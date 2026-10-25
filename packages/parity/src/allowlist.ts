// Both decision modules are imported through their own leaf module rather than the package
// index, which keeps the graph to the two decisions this file derives its rows from. The
// `scripts/dashboard.ts` runner loads this file under plain node, which resolves a bare
// sibling import only through the hook that script registers.
import type { SharedStat } from '@jsprismarine/entities/javaStats';
import { JAVA_STAT_EXCEPTIONS, statRuling } from '@jsprismarine/entities/javaStats';
import {
    BLOCK_LOSSES,
    BLOCK_MERGES,
    ENTITY_LOSSES,
    ENTITY_MERGES,
    ITEM_LOSSES,
    ITEM_MERGES,
    REGISTRY_LOSSES,
    UNTRANSLATED_REGISTRIES
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
 * The registries whose entries reach a Bedrock client under something other than an
 * identifier, as allow-list rows.
 *
 * Nothing in the repository publishes the pairing for these three, so the mapping names no
 * entry of them and the dashboard carries the whole registry as one accepted gap. The reason
 * and the reference come from `UNTRANSLATED_REGISTRIES` itself, and the carrier goes on the
 * end because it says what a Phase 2 or Phase 3 capture would have to produce.
 */
const untranslatedRegistryEntries = (): readonly AllowListEntry[] =>
    UNTRANSLATED_REGISTRIES.map((registry) => ({
        family: 'mapping.untranslated' as const,
        id: `untranslated:${registry.registry}`,
        kind: 'accepted' as const,
        reason: `${registry.reason} It travels in ${registry.carrier}.`,
        reference: registry.reference
    }));

/** Where the entity stat decision is written down, cited by every row derived from it. */
const STAT_DECISION = 'docs/adr/0001-entity-stat-authority.md, and decision 11 of docs/plans/data-driven-vanilla.md';

/**
 * The entity and stat pairs the two editions still disagree on after the server has applied
 * the stat decision: one stat, then the `minecraft:` names it differs on, separated by spaces.
 *
 * This is measured output, not a ruling. Which mobs differ is what the comparison found;
 * `statRuling` supplies the verdict and the reason for each one. Every pair here falls under a
 * stat the decision gives to Bedrock, so the whole group is one categorical accept - the client
 * predicts the movement speeds and draws the hitbox, so Bedrock's number is the one that cannot
 * desync. `jump_strength` is the one Bedrock-decided stat with no row, because the two editions
 * already agree on every mount.
 *
 * The list is exact in both directions: `checkAllowList` fails on a pair that is not here and
 * on one here that has stopped differing, so a Mojang retune lands as a reviewed edit rather
 * than being absorbed.
 */
const BEDROCK_DECIDED_DISAGREEMENTS = [
    [
        'movement_speed',
        'axolotl bat breeze cod cow creeper dolphin ender_dragon frog ghast glow_squid goat guardian ' +
            'happy_ghast horse llama magma_cube mooshroom nautilus parrot phantom piglin pufferfish ravager ' +
            'salmon sheep shulker slime sniffer squid strider sulfur_cube tadpole trader_llama tropicalfish ' +
            'turtle vex wandering_trader wither zoglin zombie_horse zombie_nautilus'
    ],
    ['flying_speed', 'bee happy_ghast'],
    [
        'width',
        'blaze chicken cod copper_golem donkey elder_guardian ender_dragon ghast hoglin horse mule piglin ' +
            'pufferfish rabbit salmon skeleton_horse snow_golem tadpole tropicalfish villager_v2 wither ' +
            'wither_skeleton zoglin zombie_horse'
    ],
    [
        'height',
        'bogged chicken cow creeper donkey drowned elder_guardian ender_dragon evocation_illager frog ' +
            'husk iron_golem mooshroom parched parrot piglin piglin_brute pillager pufferfish rabbit salmon ' +
            'skeleton snow_golem stray tadpole villager_v2 vindicator wandering_trader witch wither ' +
            'wither_skeleton wolf zombie zombie_pigman zombie_villager_v2'
    ]
] as const satisfies readonly (readonly [SharedStat, string])[];

/**
 * One entity stat gap, with the kind and the reason taken from the decision rather than
 * restated here.
 *
 * A `bedrock` or `exception` ruling is an accepted divergence and carries the decision's own
 * reason. A `java` ruling means the server should be running Java's number and is not, so the
 * row would be a defect; no row here rules that way today, and one that started to would turn
 * its own entry red without this file changing.
 */
const statEntry = (identifier: string, stat: SharedStat): AllowListEntry => {
    const ruling = statRuling(identifier, stat);
    return {
        family: 'entities.stats',
        id: `${stat}:${identifier}`,
        kind: ruling.kind === 'java' ? 'defect' : 'accepted',
        reason: ruling.reason,
        reference: STAT_DECISION
    };
};

/**
 * Every entity stat row on the dashboard: the stats Bedrock decides, and the reviewed
 * exceptions that keep Bedrock's value inside a Java-decided stat.
 *
 * The exceptions come straight from `JAVA_STAT_EXCEPTIONS`, so a row added to the decision
 * appears on the dashboard in the same change.
 */
const entityStatEntries = (): readonly AllowListEntry[] => [
    ...BEDROCK_DECIDED_DISAGREEMENTS.flatMap(([stat, names]) =>
        names.split(' ').map((name) => statEntry(`minecraft:${name}`, stat))
    ),
    ...JAVA_STAT_EXCEPTIONS.map((row) => statEntry(row.identifier, row.stat))
];

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

    // The generator keeps neighbor terrain and cross-border feature output in a per-seed cache
    // and replays it into terrain built later and into chunks it has already returned. A chunk
    // is therefore a function of the seed, its coordinates and what else the generator has
    // produced, which the chunk status ladder of the rewrite cannot preserve across worker
    // threads. `worldgen.determinism` measures both halves on chunk 0,0 at seed 1234.
    {
        family: 'worldgen.determinism',
        id: 'order-dependent:1234/0,0',
        kind: 'defect',
        reason: 'A chunk generated after its four neighbors holds different blocks from the same chunk generated first.',
        reference: 'docs/research/worldgen-defects.md under "What the tests fail to catch, and why"'
    },
    {
        family: 'worldgen.determinism',
        id: 'mutates-after-handoff:1234/0,0',
        kind: 'defect',
        reason: 'A chunk already returned changes when a neighbor is generated, because the feature patch is replayed into it.',
        reference: 'docs/research/worldgen-defects.md under "What the tests fail to catch, and why"'
    },

    ...engineActorEntries(),
    ...bodilessActorEntries(),
    ...entityStatEntries(),
    ...mappingLossEntries(),
    ...untranslatedRegistryEntries()
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
