import { damage, enchantments, ItemStack } from '@jsprismarine/items';

import type { ServerContent } from '../content/ServerContent';
import type { Item } from './Item';

/**
 * One of this server's stacks as the item runtime's own `ItemStack`, or undefined when the
 * content has no type for it.
 *
 * The durability spent goes on as `minecraft:damage` and the enchantments as
 * `minecraft:enchantments`, because an item behavior reads both. Built from the name and count
 * alone, a tool one use from breaking read as new, so `spendDurability` never reported it broken,
 * and Unbreaking never applied because the stack carried no enchantments.
 *
 * @param content - The content whose item types the stack is built from.
 * @param item - The stack to convert.
 * @param count - How many, which a caller passes when the slot's entry holds the count.
 */
export const contentStackOf = (
    content: ServerContent,
    item: Item,
    count: number = item.getAmount()
): ItemStack | undefined => {
    const identifier = item.getName();
    if (!content.items.registry.has(identifier)) return undefined;

    const stack = new ItemStack(content.items.registry.holder(identifier), count);

    const limit = item.getMaxDurability();
    if (limit > 0) stack.set(damage.name, Math.max(0, limit - item.getDurability()));

    const levels = item.getEnchantments();
    if (levels.size > 0) stack.set(enchantments.name, Object.fromEntries(levels));

    return stack;
};
