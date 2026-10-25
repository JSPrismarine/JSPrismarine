/**
 * The context number providers item components point at.
 *
 * Java 26.3 moved fuel, compost and brewing numbers out of the component and
 * behind a `context_int_provider` or `context_float_provider` file, so an item
 * no longer says "burn time 1200" but "burn time
 * `minecraft:cooking/time_boats`", and that file is a division by a
 * conditional over two more files. The generator copies every definition an
 * item component reaches into the item type table; this module evaluates one.
 */
import { itemTypesTable } from './tables';

/**
 * Which of the conditions a provider branches on hold.
 *
 * Vanilla's item-reachable providers branch on exactly two things: whether the
 * cooking block is a smoker or blast furnace
 * (`minecraft:block/fast_cooking`), and whether a composter is empty, which
 * only changes whether the first layer is guaranteed. Both default to false,
 * which is a normal furnace and a composter with something already in it.
 */
export interface ProviderContext {
    /** Decides one condition, named by its predicate id or given as the inline predicate object. */
    condition: (condition: unknown) => boolean;
}

/** A normal furnace and a non-empty composter: every condition false. */
export const DEFAULT_PROVIDER_CONTEXT: ProviderContext = { condition: () => false };

/** A smoker or blast furnace: `minecraft:block/fast_cooking` holds. */
export const FAST_COOKING_CONTEXT: ProviderContext = {
    condition: (condition) => condition === 'minecraft:block/fast_cooking'
};

/** Error thrown when a provider definition is missing or has a node kind this module does not know. */
export class NumberProviderError extends Error {
    public override name = 'NumberProviderError';
}

const asRecord = (node: unknown): Record<string, unknown> | undefined =>
    typeof node === 'object' && node !== null && !Array.isArray(node) ? { ...node } : undefined;

/**
 * Evaluates one provider node or reference to a number.
 *
 * A weighted list evaluates to its expected value, not a sample, because every
 * caller here wants the probability a composter layer is added rather than one
 * roll of it. `minecraft:compostable/low` therefore returns 0.3.
 *
 * @param node - A number, a provider id, or an inline provider definition.
 * @param context - Decides the conditions the definition branches on.
 * @param providers - The definitions to resolve a reference against, defaulting
 *   to the ones the item type table carries.
 * @throws {NumberProviderError} On an unknown reference or an unknown node kind.
 */
export const evaluateNumberProvider = (
    node: unknown,
    context: ProviderContext = DEFAULT_PROVIDER_CONTEXT,
    providers: Record<string, unknown> = itemTypesTable.providers
): number => {
    if (typeof node === 'number') return node;

    if (typeof node === 'string') {
        if (!(node in providers)) throw new NumberProviderError(`no context provider is known as ${node}`);
        return evaluateNumberProvider(providers[node], context, providers);
    }

    const record = asRecord(node);
    if (record === undefined) throw new NumberProviderError(`${JSON.stringify(node)} is not a number provider`);

    switch (record.type) {
        case 'minecraft:div': {
            const right = evaluateNumberProvider(record.right, context, providers);
            if (right === 0) throw new NumberProviderError('a div provider divides by zero');
            return evaluateNumberProvider(record.left, context, providers) / right;
        }
        case 'minecraft:conditional': {
            const branch = context.condition(record.condition) ? record.on_true : record.on_false;
            return evaluateNumberProvider(branch, context, providers);
        }
        case 'minecraft:number_dispatcher': {
            const cases = Array.isArray(record.cases) ? record.cases : [];
            for (const entry of cases) {
                const dispatch = asRecord(entry);
                if (dispatch !== undefined && context.condition(dispatch.condition)) {
                    return evaluateNumberProvider(dispatch.value, context, providers);
                }
            }
            return evaluateNumberProvider(record.default, context, providers);
        }
        case 'minecraft:weighted_list': {
            const distribution = Array.isArray(record.distribution) ? record.distribution : [];
            let total = 0;
            let weighted = 0;
            for (const entry of distribution) {
                const option = asRecord(entry);
                if (option === undefined) continue;
                const weight = typeof option.weight === 'number' ? option.weight : 1;
                total += weight;
                weighted += weight * evaluateNumberProvider(option.data, context, providers);
            }
            if (total === 0) throw new NumberProviderError('a weighted list provider has no weight');
            return weighted / total;
        }
        default:
            throw new NumberProviderError(`unknown number provider kind ${String(record.type)}`);
    }
};
