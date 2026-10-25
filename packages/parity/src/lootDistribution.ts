/**
 * What a loot table's own JSON says its draws should look like.
 *
 * This reads the declared weights and roll counts out of the table file and works out how many
 * stacks of each item one roll should produce on average. It never touches the evaluator, which
 * is the point: the prediction has to come from the table rather than from the thing under test,
 * or the comparison would be the roller agreeing with itself.
 *
 * Most of vanilla's 1447 tables cannot be predicted this way, and the rule for which ones can is
 * deliberately strict. A table qualifies only when every draw it makes is a plain weighted
 * choice between named items: no condition anywhere, no entry type but `minecraft:item`, no
 * modifier that could change which item comes out or make a stack vanish, and a roll count that
 * is either a constant or a uniform range. Anything else - a `random_chance` condition, an
 * `alternatives` container, a `loot_table` reference - makes the declared weights only part of
 * the answer, and a prediction built from them alone would be wrong rather than conservative.
 */

/** A JSON object, as far as this module needs to know. */
type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Item modifiers that leave the identity of every stack alone and never discard one.
 *
 * The comparison counts stacks per item identifier, so a modifier that only changes a count, a
 * durability or a component does not disturb it. The list is an allow list rather than a deny
 * list: a modifier nobody here has checked disqualifies the table instead of being assumed
 * harmless. `minecraft:furnace_smelt` replaces the item and `minecraft:explosion_decay` deletes
 * stacks, and both are absent for that reason.
 */
const HARMLESS_MODIFIERS: ReadonlySet<string> = new Set([
    'minecraft:apply_bonus',
    'minecraft:copy_components',
    'minecraft:copy_custom_data',
    'minecraft:copy_name',
    'minecraft:copy_state',
    'minecraft:enchant_randomly',
    'minecraft:enchant_with_levels',
    'minecraft:enchanted_count_increase',
    'minecraft:exploration_map',
    'minecraft:set_components',
    'minecraft:set_count',
    'minecraft:set_damage',
    'minecraft:set_enchantments',
    'minecraft:set_instrument',
    'minecraft:set_lore',
    'minecraft:set_name',
    'minecraft:set_potion',
    'minecraft:set_stew_effect'
]);

/** How many stacks a pool's `rolls` field produces, as a mean and a variance. */
interface RollCount {
    readonly mean: number;
    /** Zero for a constant, the variance of the uniform draw for a range. */
    readonly variance: number;
}

/**
 * Reads a pool's `rolls` as a constant or a uniform integer range.
 *
 * The provider grammar is far wider than this, and every other shape disqualifies the table.
 * A uniform integer provider draws `min + nextInt(max - min + 1)`, so the range is inclusive
 * and its variance is the discrete uniform's.
 */
const rollCount = (value: unknown): RollCount | undefined => {
    if (typeof value === 'number')
        return Number.isInteger(value) && value >= 0 ? { mean: value, variance: 0 } : undefined;
    if (!isObject(value)) return undefined;
    if (value['type'] !== 'minecraft:uniform') return undefined;

    const min = value['min'];
    const max = value['max'];
    if (typeof min !== 'number' || typeof max !== 'number') return undefined;
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) return undefined;

    const span = max - min + 1;
    return { mean: (min + max) / 2, variance: (span * span - 1) / 12 };
};

/** Whether every modifier the table carries, at any level, is one of the harmless ones. */
const modifiersAreHarmless = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.every(modifiersAreHarmless);
    if (!isObject(value)) return true;

    for (const [key, member] of Object.entries(value)) {
        if (key === 'modifier') {
            const modifiers = Array.isArray(member) ? member : [member];
            // 26.3 names an item modifier's type `type`, the same key an entry uses, and a
            // `modifier` field takes either one object or a list of them.
            const named = modifiers.every((entry) => {
                const type = isObject(entry) ? entry['type'] : undefined;
                return typeof type === 'string' && HARMLESS_MODIFIERS.has(type);
            });
            if (!named) return false;
        }
        if (!modifiersAreHarmless(member)) return false;
    }

    return true;
};

/** Whether a condition appears anywhere in the table, at any depth. */
const hasCondition = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(hasCondition);
    if (!isObject(value)) return false;

    return Object.entries(value).some(([key, member]) => key === 'condition' || hasCondition(member));
};

/** What one table's own file predicts its rolls will produce. */
export interface DeclaredDistribution {
    /** Expected stacks per table roll, by item identifier. */
    readonly shares: ReadonlyMap<string, number>;
    /** Expected stacks per table roll in total, which is the sum of the shares. */
    readonly meanDraws: number;
    /** Variance of the number of stacks one roll produces, from the uniform roll counts alone. */
    readonly drawsVariance: number;
    /** How many pools the prediction covers. */
    readonly pools: number;
}

/**
 * Works out what a loot table's own weights and roll counts predict, or returns undefined when
 * the table is not a plain weighted choice between named items.
 *
 * @param json - The table's raw JSON, as the pack stack loaded it.
 * @returns The expected stacks per item identifier for one roll of the table.
 */
export const declaredDistribution = (json: unknown): DeclaredDistribution | undefined => {
    if (!isObject(json)) return undefined;

    const pools = json['pools'];
    if (!Array.isArray(pools) || pools.length === 0) return undefined;
    if (hasCondition(json) || !modifiersAreHarmless(json)) return undefined;

    const shares = new Map<string, number>();
    let meanDraws = 0;
    let drawsVariance = 0;

    for (const pool of pools) {
        if (!isObject(pool)) return undefined;
        if (pool['bonus_rolls'] !== undefined && pool['bonus_rolls'] !== 0) return undefined;

        const rolls = rollCount(pool['rolls']);
        const entries = pool['entries'];
        if (rolls === undefined || !Array.isArray(entries) || entries.length === 0) return undefined;

        const weights = new Map<string, number>();
        let total = 0;
        for (const entry of entries) {
            if (!isObject(entry) || entry['type'] !== 'minecraft:item') return undefined;
            // `quality` scales the weight by the roll's luck. Every roll here runs at luck 0,
            // where it contributes nothing, but a table that declares one is left out rather
            // than predicted under an assumption about the context.
            if (entry['quality'] !== undefined) return undefined;

            const name = entry['name'];
            const weight = entry['weight'] ?? 1;
            if (typeof name !== 'string' || typeof weight !== 'number' || !Number.isInteger(weight)) return undefined;
            if (weight <= 0) return undefined;

            weights.set(name, (weights.get(name) ?? 0) + weight);
            total += weight;
        }

        for (const [name, weight] of weights) {
            shares.set(name, (shares.get(name) ?? 0) + (rolls.mean * weight) / total);
        }
        meanDraws += rolls.mean;
        drawsVariance += rolls.variance;
    }

    return { shares, meanDraws, drawsVariance, pools: pools.length };
};
