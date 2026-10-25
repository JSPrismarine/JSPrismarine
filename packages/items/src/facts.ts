import type { FlatTable } from '@jsprismarine/content';
import { flatten } from '@jsprismarine/content';

import { cookingFuel, food, maxDamage, tool } from './components/defaults';
import { maxStackSize } from './components/universal';
import type { ItemType } from './hooks';
import type { ItemRegistry } from './itemTypes';
import type { ProviderContext } from './numberProvider';
import { DEFAULT_PROVIDER_CONTEXT, NumberProviderError } from './numberProvider';
import { evaluateNumberProvider } from './numberProvider';

/**
 * The burn time of one item type in ticks, zero when the item is not a fuel.
 *
 * 26.3 writes a burn time as a reference into `context_int_provider`, so the
 * number depends on the cooking block: `minecraft:cooking/time_boats` is
 * 1200 in a furnace and 600 in a smoker. The default context is the furnace.
 *
 * @param context - Which conditions the provider branches on hold.
 */
export const burnTimeOf = (type: ItemType, context: ProviderContext = DEFAULT_PROVIDER_CONTEXT): number => {
    const fuel = type.params(cookingFuel);
    if (fuel?.burn_time === undefined) return 0;
    const source = fuel.burn_time;
    const node = source.kind === 'inline' ? source.value : source.kind === 'reference' ? source.id : source.provider;
    try {
        return Math.round(evaluateNumberProvider(node, context));
    } catch (error) {
        if (error instanceof NumberProviderError) return 0;
        throw error;
    }
};

/** The columns {@link flattenItemFacts} fills, one typed array each. */
const itemFactColumns = (context: ProviderContext) =>
    ({
        maxStackSize: { kind: 'u8', read: (type: ItemType) => type.params(maxStackSize), default: 1 },
        maxDamage: { kind: 'u16', read: (type: ItemType) => type.params(maxDamage), default: 0 },
        isFood: { kind: 'u8', read: (type: ItemType) => (type.params(food) === undefined ? 0 : 1), default: 0 },
        isTool: { kind: 'u8', read: (type: ItemType) => (type.params(tool) === undefined ? 0 : 1), default: 0 },
        burnTimeTicks: { kind: 'u16', read: (type: ItemType) => burnTimeOf(type, context), default: 0 }
    }) as const;

/** The flattened item fact table: five typed arrays indexed by the registry's dense item id. */
export type ItemFacts = FlatTable<ReturnType<typeof itemFactColumns>>;

/**
 * Precomputes the item facts a hot path reads, indexed by the registry's
 * dense id, so an inventory move or a furnace tick reads an array slot
 * instead of walking a type's component list.
 *
 * `burnTimeTicks` is capped by the `u16` column, which the longest vanilla
 * burn time, the lava bucket's 20000 ticks, fits inside.
 *
 * @param registry - A built registry; its ids are the table's indices.
 * @param context - The cooking context burn times are resolved for, a normal
 *   furnace by default.
 * @throws {FlattenError} When a value does not fit its column.
 */
export const flattenItemFacts = (
    registry: ItemRegistry,
    context: ProviderContext = DEFAULT_PROVIDER_CONTEXT
): ItemFacts =>
    flatten(
        [...registry].map(([, type]) => type),
        {
            id: (type) => registry.idOf(type.identifier)!,
            length: registry.size,
            columns: itemFactColumns(context)
        }
    );
