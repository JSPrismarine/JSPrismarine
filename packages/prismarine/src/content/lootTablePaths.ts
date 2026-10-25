/**
 * The Bedrock spelling of a loot table reference.
 *
 * A behavior pack names a pack-relative file, `loot_tables/chests/simple_dungeon.json`, and that
 * is the spelling the game keeps in a chest's `LootTable` tag and in an entity's
 * `minecraft:loot` component. `ServerContent.loot` is Java's registry, keyed
 * `minecraft:chests/simple_dungeon`. The two layouts line up exactly for the vanilla tables, so
 * each direction is a rewrite rather than a mapping table.
 *
 * {@link import('../entity/data/facts').javaLootIdOf} is the other direction; the two are pinned
 * to each other by a round trip in `lootTablePaths.test.ts`.
 */

/**
 * The Bedrock loot table path for a Java loot table id.
 *
 * @returns The pack-relative path, with the `minecraft:` namespace dropped the way a behavior
 *   pack drops it.
 */
export const bedrockLootPathOf = (id: string): string =>
    `loot_tables/${id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id}.json`;
