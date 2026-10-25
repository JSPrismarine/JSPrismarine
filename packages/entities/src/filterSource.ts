import type { Filter } from '@jsprismarine/packs';
import { parseFilter } from '@jsprismarine/packs';

/**
 * Two filter shapes the vanilla entity files write that the published grammar
 * does not describe, normalized into the grammar before
 * `@jsprismarine/packs` parses them.
 *
 * The first is a group map with more than one combinator key, which five
 * vanilla filters use: the villager's `become_zombie` sensor writes `all_of`
 * and `any_of` side by side. Reading them as one `all_of` over the two groups
 * is the only interpretation that keeps both.
 *
 * The second is a legacy shorthand where the key is the test and the value is
 * what it compares against. One vanilla filter uses it, in the skeleton's
 * `minecraft:lightning_immune` group.
 */

const COMBINATORS = new Set(['all_of', 'any_of', 'none_of', 'all', 'any', 'AND', 'OR', 'NOT']);

/** The legacy shorthand keys, each with the test it stands for. */
const SHORTHANDS: ReadonlyMap<string, { readonly test: string; readonly subject: string }> = new Map([
    ['other_with_families', { test: 'is_family', subject: 'other' }]
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const expandShorthand = (spec: { readonly test: string; readonly subject: string }, value: unknown): unknown => {
    if (!Array.isArray(value)) return { ...spec, value };
    return { any_of: value.map((member) => ({ ...spec, value: member })) };
};

/**
 * Rewrites a filter value into the published grammar, leaving anything
 * already in it alone.
 */
export const normalizeFilterSource = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalizeFilterSource);
    if (!isRecord(value)) return value;

    const keys = Object.keys(value);
    if (keys.length === 1) {
        const key = keys[0]!;
        const shorthand = SHORTHANDS.get(key);
        if (shorthand !== undefined) return expandShorthand(shorthand, value[key]);
        if (COMBINATORS.has(key)) return { [key]: normalizeFilterSource(value[key]) };
        return value;
    }

    const known = keys.filter((key) => COMBINATORS.has(key) || SHORTHANDS.has(key));
    if (known.length === 0 || known.length !== keys.length) return value;
    return { all_of: keys.map((key) => normalizeFilterSource({ [key]: value[key] })) };
};

/**
 * Parses a filter from an entity definition.
 *
 * @throws {FilterParseError} When the value does not follow the grammar even
 *   after normalization.
 */
export const parseEntityFilter = (value: unknown): Filter => parseFilter(normalizeFilterSource(value));
