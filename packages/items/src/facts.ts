import type { FlatTable } from '@jsprismarine/content';
import { flatten } from '@jsprismarine/content';

import { cookingFuel, food, maxDamage, tool } from './components/defaults';
import { maxStackSize } from './components/universal';
import type { ItemType } from './hooks';
import type { ItemRegistry } from './itemTypes';
import type { ProviderContext } from './numberProvider';
import type { NumberSource } from './schema';
import { DEFAULT_PROVIDER_CONTEXT } from './numberProvider';
import { evaluateNumberProvider } from './numberProvider';
import { NumberProviderError } from '@jsprismarine/errors/items';

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
    const burnTime = fuelNumber(type.params(cookingFuel)?.burn_time, context);
    // A burn time is a `context_int_provider`, whose `minecraft:div` is Java's integer `Quotient`:
    // a dried kelp block's 4001 burns 2000 ticks in a smoker, not 2001.
    return burnTime === undefined ? 0 : Math.trunc(burnTime);
};

/**
 * How much faster a cooking block cooks while one item type burns in it, Java's
 * `AbstractFurnaceBlockEntity.getSpeedMultiplier`, which divides a recipe's cooking time: 2 in a
 * smoker or a blast furnace for the vanilla fuels, through `minecraft:cooking/speed_default`, and
 * 1 for an item that names no multiplier.
 *
 * @param context - Which conditions the provider branches on hold.
 */
export const speedMultiplierOf = (type: ItemType, context: ProviderContext = DEFAULT_PROVIDER_CONTEXT): number =>
    fuelNumber(type.params(cookingFuel)?.speed_multiplier, context) ?? 1;

/** Evaluates one number of a `minecraft:cooking_fuel` component, or undefined when it is absent or unknown. */
const fuelNumber = (source: NumberSource | undefined, context: ProviderContext): number | undefined => {
    if (source === undefined) return undefined;
    const node = source.kind === 'inline' ? source.value : source.kind === 'reference' ? source.id : source.provider;
    try {
        return evaluateNumberProvider(node, context);
    } catch (error) {
        if (error instanceof NumberProviderError) return undefined;
        throw error;
    }
};

/** The columns {@link flattenItemFacts} fills, one typed array each. */
export const itemFactColumns = (context: ProviderContext) =>
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
