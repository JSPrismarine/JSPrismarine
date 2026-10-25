/**
 * A rolled loot stack as the drop the rest of the server carries.
 *
 * `@jsprismarine/loot` evaluates Java's tables and hands back stacks with Java's own data
 * components on them, untranslated, because translating a component payload is the item
 * layer's job and not the evaluator's. This module is that translation, for the components a
 * drop has somewhere to put: the enchantments, the durability already spent, a name and lore a
 * modifier wrote, and the contents `copy_components` lifts off a shulker box's block entity.
 *
 * Three callers rolled a table and kept the id and the count alone - a block break, a mob
 * death and `/loot` - so an enchanted book out of a dungeon chest arrived unenchanted and a
 * broken shulker box arrived empty. They all come through here now.
 *
 * The component values are whatever the table's JSON said, so every read checks rather than
 * asserts. A component this does not recognize is left where it is rather than guessed at.
 */
import type { ItemStack as PredicateItemStack } from '@jsprismarine/predicates';

import type { ContentItemDrop } from '../content/world/adapter';

/**
 * A drop as a stack the loot and predicate grammars read, which is {@link dropOfRolledStack}
 * backwards.
 *
 * What a block entity's contents have to be in before a table's `copy_components` can lift
 * them onto the item the block drops, which is how a shulker box leaves with what it held.
 */
export const rolledStackOfDrop = (drop: ContentItemDrop): PredicateItemStack => {
    const components = new Map<string, unknown>();
    if (drop.enchantments !== undefined) components.set('minecraft:enchantments', { levels: drop.enchantments });
    if (drop.damage !== undefined && drop.damage > 0) components.set('minecraft:damage', drop.damage);
    if (drop.customName !== undefined) components.set('minecraft:custom_name', drop.customName);
    if (drop.lore !== undefined && drop.lore.length > 0) components.set('minecraft:lore', [...drop.lore]);
    if (drop.contents !== undefined) {
        components.set('minecraft:container', containerComponentOf(drop.contents));
    }

    return { id: drop.identifier, count: drop.count, components };
};

/** Java's `minecraft:container`: one `{ slot, item }` per filled slot, empty ones left out. */
export const containerComponentOf = (
    contents: readonly (ContentItemDrop | undefined)[]
): readonly { readonly slot: number; readonly item: PredicateItemStack }[] =>
    contents.flatMap((held, slot) => (held === undefined ? [] : [{ slot, item: rolledStackOfDrop(held) }]));

/** A JSON object, which is the only shape any of the component readers below looks into. */
const fieldsOf = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? // Parsed pack JSON, which the compiler cannot see the shape of. Every read off the
          // result checks the type of what it found.
          (value as Record<string, unknown>)
        : undefined;

/**
 * The readable text of a Java text component.
 *
 * A name or a lore line is a text component, which is a bare string in most tables and an
 * object with a `text` in the rest. A translated one has no text to read without the client's
 * language file, so its key goes through instead, which is what the client would show anyway
 * for a key it does not have.
 */
const plainText = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;

    const fields = fieldsOf(value);
    if (fields === undefined) return undefined;
    if (typeof fields['text'] === 'string') return fields['text'];
    return typeof fields['translate'] === 'string' ? fields['translate'] : undefined;
};

/**
 * The levels on a `minecraft:enchantments` component.
 *
 * Java wraps the map in `levels` and a few tables write the bare map, which is the pair
 * `@jsprismarine/predicates` reads the same way.
 */
const enchantmentsOf = (value: unknown): Record<string, number> | undefined => {
    const fields = fieldsOf(value);
    if (fields === undefined) return undefined;

    const source = fieldsOf(fields['levels']) ?? fields;
    const levels: Record<string, number> = {};
    for (const [id, level] of Object.entries(source)) {
        if (typeof level === 'number' && level > 0) levels[id] = Math.trunc(level);
    }

    return Object.keys(levels).length === 0 ? undefined : levels;
};

/** One entry of a `minecraft:container` component, which names a slot and a stack. */
const containerEntry = (value: unknown): { slot: number; drop: ContentItemDrop } | undefined => {
    const fields = fieldsOf(value);
    if (fields === undefined) return undefined;

    // Java's shape is `{ slot, item }`; a `set_contents` modifier writes the stack on its own
    // and lets the list order be the slot order.
    const held = fields['item'] === undefined ? fields : fieldsOf(fields['item']);
    if (held === undefined || typeof held['id'] !== 'string') return undefined;

    const components = held['components'];
    const slot = typeof fields['slot'] === 'number' ? fields['slot'] : -1;

    return {
        slot,
        drop: dropOfRolledStack({
            id: held['id'],
            count: typeof held['count'] === 'number' ? held['count'] : 1,
            components: components instanceof Map ? components : new Map()
        })
    };
};

/** What a container item holds, by slot, out of its `minecraft:container` component. */
const contentsOf = (value: unknown): readonly (ContentItemDrop | undefined)[] | undefined => {
    if (!Array.isArray(value)) return undefined;

    const placed: { slot: number; drop: ContentItemDrop }[] = [];
    value.forEach((entry: unknown, index) => {
        const held = containerEntry(entry);
        if (held === undefined) return;
        placed.push({ slot: held.slot < 0 ? index : held.slot, drop: held.drop });
    });
    if (placed.length === 0) return undefined;

    let size = 0;
    for (const { slot } of placed) size = Math.max(size, slot + 1);

    const contents = new Array<ContentItemDrop | undefined>(size).fill(undefined);
    for (const { slot, drop } of placed) contents[slot] = drop;
    return contents;
};

/**
 * One rolled stack as a drop, with the Java components it carried read onto it.
 *
 * @returns The drop, whose count is the stack's own; a caller that filters empty stacks still
 *   has to do so, because a count of zero is a thing `minecraft:explosion_decay` produces.
 */
export const dropOfRolledStack = (stack: PredicateItemStack): ContentItemDrop => {
    const components = stack.components;
    const enchantments = enchantmentsOf(components.get('minecraft:enchantments'));
    const damage = components.get('minecraft:damage');
    const customName = plainText(components.get('minecraft:custom_name'));
    const lore = components.get('minecraft:lore');
    const lines = Array.isArray(lore) ? lore.map(plainText).filter((line) => line !== undefined) : [];
    const contents = contentsOf(components.get('minecraft:container'));

    return {
        identifier: stack.id,
        count: stack.count,
        ...(enchantments === undefined ? {} : { enchantments }),
        ...(typeof damage === 'number' && damage > 0 ? { damage: Math.trunc(damage) } : {}),
        ...(customName === undefined ? {} : { customName }),
        ...(lines.length === 0 ? {} : { lore: lines }),
        ...(contents === undefined ? {} : { contents })
    };
};
