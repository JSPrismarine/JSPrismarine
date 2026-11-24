/**
 * An item stack as the NBT Java's `/data` shows it, `{id, count, components}`, and back.
 *
 * The components carry what a stack keeps here that Java has a component for: a name, lore,
 * durability spent, enchantments and, for a shulker box, what it holds as `minecraft:container`.
 * What Bedrock keeps that Java has no component for, such as the blocks a stack may be placed on,
 * has no tag, so a container edit keeps each stack the edit left alone exactly as it was rather
 * than rebuilding it from its tag.
 */
import type { NbtCompoundTag, NbtTag } from '@jsprismarine/nbt/tag';
import {
    byteTag,
    compoundTag,
    entryOf,
    intTag,
    isNumericTag,
    listTag,
    numericValueOf,
    stringTag,
    tagsEqual
} from '@jsprismarine/nbt/tag';
import { namespaced } from '@jsprismarine/predicates';

import type { ContentItemDrop } from '../../content/world/adapter';
import { bedrockItemDrops } from '../../item/bedrockDrops';

/** A tag's number, or undefined when it holds none. */
export const numberOf = (tag: NbtTag | undefined): number | undefined =>
    tag !== undefined && isNumericTag(tag) ? numericValueOf(tag) : undefined;

/** The strings of a list tag, or undefined when it holds anything else. */
export const stringsOf = (tag: NbtTag | undefined): readonly string[] | undefined => {
    if (tag?.type !== 'list') return undefined;
    const strings = tag.value.flatMap((entry) => (entry.type === 'string' ? [entry.value] : []));
    return strings.length === tag.value.length ? strings : undefined;
};

/** A stack in Java's form: `{id, count, components}`, with `Slot` when it sits in a list. */
export const stackTag = (drop: ContentItemDrop, slot?: number): NbtCompoundTag => {
    const components: [string, NbtTag][] = [];
    if (drop.customName !== undefined) components.push(['minecraft:custom_name', stringTag(drop.customName)]);
    if (drop.lore !== undefined && drop.lore.length > 0)
        components.push(['minecraft:lore', listTag(drop.lore.map(stringTag))]);
    if (drop.damage !== undefined && drop.damage > 0) components.push(['minecraft:damage', intTag(drop.damage)]);
    if (drop.enchantments !== undefined) {
        const levels = Object.entries(drop.enchantments).map(([id, level]): [string, NbtTag] => [id, intTag(level)]);
        components.push(['minecraft:enchantments', compoundTag(levels)]);
    }
    if (drop.contents !== undefined) {
        // Java's `minecraft:container`: one `{slot, item}` per filled slot.
        const held = drop.contents.flatMap((inside, index) =>
            inside === undefined
                ? []
                : [
                      compoundTag([
                          ['slot', intTag(index)],
                          ['item', stackTag(inside)]
                      ])
                  ]
        );
        if (held.length > 0) components.push(['minecraft:container', listTag(held)]);
    }

    return compoundTag([
        ...(slot === undefined ? [] : [['Slot', byteTag(slot)] as const]),
        ['id', stringTag(drop.identifier)],
        ['count', intTag(drop.count)],
        ...(components.length === 0 ? [] : [['components', compoundTag(components)] as const])
    ]);
};

/** A list of stacks in Java's form, each with its `Slot`, leaving the empty slots out. */
export const stacksTag = (drops: readonly (ContentItemDrop | undefined)[]): NbtTag =>
    listTag(drops.flatMap((drop, slot) => (drop === undefined ? [] : [stackTag(drop, slot)])));

/**
 * A stack tag as a drop, which is {@link stackTag} backwards, with the ids as written.
 *
 * @returns The drop; undefined for anything that is not a stack.
 */
const dropOfStackTag = (tag: NbtTag): ContentItemDrop | undefined => {
    if (tag.type !== 'compound') return undefined;
    const id = entryOf(tag.value, 'id');
    const count = numberOf(entryOf(tag.value, 'count')) ?? 1;
    if (id?.type !== 'string' || count <= 0) return undefined;

    const components = entryOf(tag.value, 'components');
    // SNBT keys a component either way, `minecraft:damage` or `damage`.
    const component = (name: string): NbtTag | undefined =>
        components?.type === 'compound'
            ? (entryOf(components.value, `minecraft:${name}`) ?? entryOf(components.value, name))
            : undefined;
    const customName = component('custom_name');
    const lore = stringsOf(component('lore'));
    const damage = numberOf(component('damage'));
    const enchantments = component('enchantments');
    const levels =
        enchantments?.type === 'compound'
            ? Object.fromEntries(
                  Object.entries(enchantments.value).flatMap(([enchantment, level]) => {
                      const value = numberOf(level);
                      return value === undefined || value <= 0 ? [] : [[namespaced(enchantment), Math.trunc(value)]];
                  })
              )
            : {};
    const contents = contentsOf(component('container'));

    return {
        identifier: namespaced(id.value),
        count: Math.trunc(count),
        ...(customName?.type === 'string' ? { customName: customName.value } : {}),
        ...(lore === undefined || lore.length === 0 ? {} : { lore }),
        ...(damage === undefined || damage <= 0 ? {} : { damage: Math.trunc(damage) }),
        ...(Object.keys(levels).length === 0 ? {} : { enchantments: levels }),
        ...(contents === undefined ? {} : { contents })
    };
};

/** What a `minecraft:container` component holds, by slot; undefined when it holds nothing. */
const contentsOf = (tag: NbtTag | undefined): (ContentItemDrop | undefined)[] | undefined => {
    if (tag?.type !== 'list') return undefined;
    const placed = tag.value.flatMap((entry) => {
        if (entry.type !== 'compound') return [];
        const slot = numberOf(entryOf(entry.value, 'slot'));
        const item = entryOf(entry.value, 'item');
        const drop = item === undefined ? undefined : dropOfStackTag(item);
        return slot === undefined || slot < 0 || drop === undefined ? [] : [{ slot: Math.trunc(slot), drop }];
    });
    if (placed.length === 0) return undefined;
    const contents = new Array<ContentItemDrop | undefined>(Math.max(...placed.map(({ slot }) => slot)) + 1).fill(
        undefined
    );
    for (const { slot, drop } of placed) contents[slot] = drop;
    return contents;
};

/**
 * The slots of a container after an edit of its `Items` list.
 *
 * A stack whose tag is the one {@link stacksTag} wrote for that slot is kept as it was, so what a
 * tag does not show survives an edit of another slot. A changed or new one is read from its tag,
 * with Java's ids translated, as a datapack's are.
 *
 * @param items - The edited `Items` tag; anything but a list empties the container.
 * @param before - What each slot held before the edit.
 * @param size - How many slots the container has. A stack in a slot past it is dropped.
 */
export const containerSlotsOf = (
    items: NbtTag | undefined,
    before: readonly (ContentItemDrop | undefined)[],
    size: number
): (ContentItemDrop | undefined)[] => {
    const slots = new Array<ContentItemDrop | undefined>(size).fill(undefined);
    if (items?.type !== 'list') return slots;

    const changed: { slot: number; drop: ContentItemDrop }[] = [];
    for (const entry of items.value) {
        const at = entry.type === 'compound' ? numberOf(entryOf(entry.value, 'Slot')) : undefined;
        if (at === undefined) continue;
        const slot = Math.trunc(at);
        if (slot < 0 || slot >= size) continue;
        const kept = before[slot];
        if (kept !== undefined && tagsEqual(stackTag(kept, slot), entry)) {
            slots[slot] = kept;
            continue;
        }
        const drop = dropOfStackTag(entry);
        if (drop !== undefined) changed.push({ slot, drop });
    }

    const translated = bedrockItemDrops(changed.map(({ drop }) => drop));
    changed.forEach(({ slot }, index) => {
        slots[slot] = translated[index];
    });
    return slots;
};
