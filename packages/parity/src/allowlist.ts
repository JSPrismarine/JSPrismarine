import type { Family } from './families.ts';

/**
 * One expected gap: a comparison the suite knows fails today, with the reason it is allowed
 * to and where that reason is written down.
 */
export interface AllowListEntry {
    /** The family whose comparison produces the gap. */
    family: Family;
    /** The gap id the comparison reports, for example `minecraft:zombie` or `item:minecraft:spear`. */
    id: string;
    /** Why the gap is expected rather than a defect. */
    reason: string;
    /** A research note section or issue that records the gap, for example `docs/research/edition-behavior-differences.md section 2`. */
    reference: string;
}

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
        reason: 'The actor keeps the legacy id; the egg item is minecraft:evoker_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    },
    {
        family: 'registry.entities',
        id: 'spawn-egg:minecraft:tropicalfish',
        reason: 'The actor keeps the legacy id; the egg item is minecraft:tropical_fish_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    },
    {
        family: 'registry.entities',
        id: 'spawn-egg:minecraft:villager_v2',
        reason: 'The actor keeps the legacy _v2 id; the egg item is minecraft:villager_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    },
    {
        family: 'registry.entities',
        id: 'spawn-egg:minecraft:zombie_villager_v2',
        reason: 'The actor keeps the legacy _v2 id; the egg item is minecraft:zombie_villager_spawn_egg.',
        reference: 'docs/research/java-to-bedrock-translation.md section 4'
    }
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
