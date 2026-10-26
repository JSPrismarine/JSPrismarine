/**
 * The Java-to-Bedrock seam for what a table rolled.
 *
 * Every loot table this server rolls is Java's, so every id that comes out of one is a Java
 * id. The client resolves a Bedrock id. Most of the 1658 items are spelled the same on both
 * sides, which is why handing the Java id straight to `Item` worked for all but the ones
 * `@jsprismarine/mapping` lists as reviewed losses: a dropped `minecraft:furnace_minecart` or
 * `minecraft:spectral_arrow` reached the wire under a name the Bedrock registry has no item
 * for, and the stack the player got was whatever the unknown id resolved to.
 *
 * `mapLootToBedrock` owns the translation and `javaItemToBedrock` is the lookup it takes.
 * Both already existed; neither had a call site until this module.
 *
 * An id the pinned Java version does not have is left exactly as it stands. The translation
 * drops it, which is the right answer for a Java table with a typo in it and the wrong one
 * here, because a Bedrock pack's own table names Bedrock items and nothing is gained by
 * refusing to drop them.
 */
import { legacy_item_aliases, legacy_item_aux_aliases } from '@jsprismarine/bedrock-data';
import { mapLootToBedrock } from '@jsprismarine/loot';
import type { BedrockStack } from '@jsprismarine/loot';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import type { ItemStack as PredicateItemStack } from '@jsprismarine/predicates';

import type { ContentItemDrop } from '../content/world/adapter';

/**
 * The components the translation never reads, so one empty map stands in for every stack.
 *
 * `mapLootToBedrock` carries components across untouched and this module translates ids, so
 * the drop keeps its own and the stack handed to the translation needs none.
 */
const NO_COMPONENTS: ReadonlyMap<string, unknown> = new Map();

/**
 * Every stack in one drop, the drop itself first and then whatever it holds.
 *
 * A shulker box carries its contents as drops of their own, and those ids are Java ids too,
 * so they are translated in the same pass rather than left for whoever opens the box.
 */
const stacksIn = (drop: ContentItemDrop): PredicateItemStack[] => [
    { id: drop.identifier, count: drop.count, components: NO_COMPONENTS },
    ...(drop.contents ?? []).flatMap((held) => (held === undefined ? [] : stacksIn(held)))
];

/** One drop under its Bedrock name, with the aux value that names a sub-item when there is one. */
const renamed = (drop: ContentItemDrop, bedrock: ReadonlyMap<string, BedrockStack>): ContentItemDrop => {
    const mapped = bedrock.get(drop.identifier);
    const contents = drop.contents?.map((held) => (held === undefined ? undefined : renamed(held, bedrock)));

    return {
        ...drop,
        ...(mapped === undefined
            ? {}
            : {
                  identifier: mapped.identifier,
                  ...(mapped.data === undefined ? {} : { meta: mapped.data })
              }),
        ...(contents === undefined ? {} : { contents })
    };
};

/** Replaces a legacy Bedrock item name and auxiliary value with its current item identifier. */
const currentItemIdentifier = (drop: ContentItemDrop): ContentItemDrop => {
    const contents = drop.contents?.map((held) => (held === undefined ? undefined : currentItemIdentifier(held)));
    const variant = legacy_item_aux_aliases[drop.identifier]?.[String(drop.meta ?? 0)];
    const identifier = variant ?? legacy_item_aliases[drop.identifier];

    return {
        ...drop,
        ...(identifier === undefined ? {} : { identifier }),
        ...(variant === undefined ? {} : { meta: 0 }),
        ...(contents === undefined ? {} : { contents })
    };
};

/**
 * What a roll dropped, under the names a Bedrock client resolves.
 *
 * @param drops - The drops as the table rolled them, by Java id.
 * @returns The same drops in the same order, each under its current Bedrock identifier. Legacy
 *   auxiliary variants become their current names; counts, enchantments, names, and lore remain.
 */
export const bedrockItemDrops = (drops: readonly ContentItemDrop[]): readonly ContentItemDrop[] => {
    if (drops.length === 0) return drops;

    // One translation call for the whole tree, keyed back by the Java id it went in under.
    // The lookup is a function of the id alone, so two stacks of the same item share an entry.
    const { stacks } = mapLootToBedrock(drops.flatMap(stacksIn), javaItemToBedrock);
    const bedrock = new Map(stacks.map((stack) => [stack.javaId, stack]));

    return drops.map((drop) => currentItemIdentifier(renamed(drop, bedrock)));
};
