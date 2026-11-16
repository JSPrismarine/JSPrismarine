/**
 * Java's `EnchantmentHelper.enchantItemFromProvider`: enchants an item through one entry of the
 * `enchantment_provider` registry, as a trap skeleton's bow and helmet or a raider's weapon are.
 *
 * The registry's three types are `minecraft:by_cost`, `minecraft:by_cost_with_difficulty` and
 * `minecraft:single`. The first two draw an enchanting cost and run the enchanting table's draw,
 * `EnchantmentHelper.selectEnchantment`, over the provider's enchantments; the second widens the
 * cost by the place's regional difficulty. The last adds one enchantment at a drawn level.
 */
import type { EnchantmentRegistry } from '@jsprismarine/enchantments';
import { selectEnchantments } from '@jsprismarine/enchantments';
import { enchantable } from '@jsprismarine/items';
import type { RandomSource } from '@jsprismarine/predicates';

import type { ServerContent } from '../content/ServerContent';
import type { ContentItemDrop } from '../content/world/adapter';
import { isRecord } from '../utils/isRecord';

/** What enchanting from a provider reads. */
export interface EnchantmentProviderSource {
    readonly enchantments: EnchantmentRegistry;
    /** The `enchantment_provider` registry entry by id, as parsed JSON. */
    provider(id: string): unknown;
    /** An item's `minecraft:enchantable` value, 0 for one that takes no enchantments. */
    enchantability(identifier: string): number;
}

/** The provider source of a loaded stack. */
export const enchantmentProviderSourceOf = (content: ServerContent): EnchantmentProviderSource => ({
    enchantments: content.enchantments,
    provider: (id) => content.definitions.enchantmentProviders.get(id)?.data,
    enchantability: (identifier) => content.items.types.get(identifier)?.params(enchantable)?.value ?? 0
});

/** Java's `Mth.randomBetweenInclusive`. */
const between = (random: RandomSource, min: number, max: number): number =>
    max <= min ? min : min + random.nextInt(max - min + 1);

/** An int provider as a datapack writes one: a constant, or `uniform` with `min_inclusive` and `max_inclusive`. */
const drawInt = (value: unknown, random: RandomSource): number | undefined => {
    if (typeof value === 'number') return Math.trunc(value);
    if (!isRecord(value)) return undefined;
    if (value.type === 'minecraft:constant' && typeof value.value === 'number') return Math.trunc(value.value);
    const min = value.min_inclusive;
    const max = value.max_inclusive;
    return typeof min === 'number' && typeof max === 'number' ? between(random, min, max) : undefined;
};

/** The enchantments a provider names: a `#tag`, one id or a list of ids. */
const candidatesOf = (source: EnchantmentProviderSource, value: unknown): readonly string[] => {
    if (typeof value === 'string')
        return value.startsWith('#') ? [...source.enchantments.membersOf(value.slice(1))] : [value];
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
};

/**
 * One item enchanted through a provider, or the item unchanged when the provider names nothing the
 * server can draw from. Enchantments the item already has are upgraded, never lowered.
 *
 * @param source - The enchantments, the providers and each item's enchantability.
 * @param provider - The provider's id, such as `minecraft:mob_spawn_equipment`.
 * @param item - The item to enchant.
 * @param random - The draws, the mob's random as Java passes it.
 * @param specialMultiplier - The place's clamped regional difficulty, `DifficultyInstance.getSpecialMultiplier`.
 * @returns The item with the drawn enchantments.
 */
export const enchantFromProvider = (
    source: EnchantmentProviderSource,
    provider: string,
    item: ContentItemDrop,
    random: RandomSource,
    specialMultiplier: number
): ContentItemDrop => {
    const definition = source.provider(provider);
    if (!isRecord(definition)) return item;
    const stack = {
        id: item.identifier,
        count: 1,
        components: new Map<string, unknown>([
            ['minecraft:enchantable', { value: source.enchantability(item.identifier) }]
        ])
    };
    const drawn: { enchantment: string; level: number }[] = [];
    if (definition.type === 'minecraft:single') {
        const level = drawInt(definition.level, random);
        const [enchantment] = candidatesOf(source, definition.enchantment);
        if (enchantment !== undefined && level !== undefined) drawn.push({ enchantment, level });
    } else {
        let cost: number | undefined;
        if (definition.type === 'minecraft:by_cost_with_difficulty') {
            const min = typeof definition.min_cost === 'number' ? definition.min_cost : 1;
            const span = typeof definition.max_cost_span === 'number' ? definition.max_cost_span : 0;
            cost = between(random, min, min + Math.trunc(Math.fround(specialMultiplier * span)));
        } else if (definition.type === 'minecraft:by_cost') cost = drawInt(definition.cost, random);
        if (cost === undefined) return item;
        drawn.push(
            ...selectEnchantments(
                source.enchantments,
                random,
                stack,
                cost,
                candidatesOf(source, definition.enchantments)
            )
        );
    }
    if (drawn.length === 0) return item;
    const enchantments: Record<string, number> = { ...item.enchantments };
    for (const { enchantment, level } of drawn)
        enchantments[enchantment] = Math.max(enchantments[enchantment] ?? 0, level);
    return { ...item, enchantments };
};
