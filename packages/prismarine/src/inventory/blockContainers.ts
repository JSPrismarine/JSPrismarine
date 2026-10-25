/**
 * Which screen a block opens, and how many slots that screen shows.
 *
 * No block opened a container anywhere in this server before this module: `openMainInventory`
 * was the only `ContainerOpen` ever sent, and it answers the client asking for its own
 * inventory. A chest, a furnace and a crafting table all did nothing when they were clicked.
 *
 * The screen is a table because there is no other source for it. `WindowTypes` is Mojang's
 * `ContainerType` enum, generated from the protocol docs, and nothing in either pack format
 * says which block draws which of its 39 members. The slot count is not a table: it comes from
 * `slotsOf` in `@jsprismarine/block-behaviors`, which is where this project already records how
 * many slots a container has and what a comparator reads out of one.
 */
import { WindowTypes } from '@jsprismarine/minecraft';
import { slotsOf } from '@jsprismarine/block-behaviors';

/** The bare name of a namespaced identifier: `minecraft:chest` is `chest`. */
const bareName = (identifier: string): string => identifier.replace(/^[^:]*:/, '');

/**
 * Block to screen, by bare name.
 *
 * Every shulker box is handled by suffix rather than by listing the 17 dye colors, and so are
 * the three anvil damage stages.
 */
const SCREENS: Readonly<Record<string, WindowTypes>> = {
    chest: WindowTypes.CONTAINER,
    trapped_chest: WindowTypes.CONTAINER,
    ender_chest: WindowTypes.CONTAINER,
    barrel: WindowTypes.CONTAINER,
    crafting_table: WindowTypes.WORKBENCH,
    furnace: WindowTypes.FURNACE,
    lit_furnace: WindowTypes.FURNACE,
    blast_furnace: WindowTypes.BLAST_FURNACE,
    lit_blast_furnace: WindowTypes.BLAST_FURNACE,
    smoker: WindowTypes.SMOKER,
    lit_smoker: WindowTypes.SMOKER,
    enchanting_table: WindowTypes.ENCHANTMENT,
    brewing_stand: WindowTypes.BREWING_STAND,
    dispenser: WindowTypes.DISPENSER,
    dropper: WindowTypes.DROPPER,
    hopper: WindowTypes.HOPPER,
    beacon: WindowTypes.BEACON,
    loom: WindowTypes.LOOM,
    grindstone: WindowTypes.GRINDSTONE,
    stonecutter_block: WindowTypes.STONECUTTER,
    cartography_table: WindowTypes.CARTOGRAPHY,
    smithing_table: WindowTypes.SMITHING_TABLE,
    lectern: WindowTypes.LECTERN,
    crafter: WindowTypes.CRAFTER,
    decorated_pot: WindowTypes.DECORATED_POT
};

/** What a block's screen is, once it has been resolved. */
export interface BlockContainer {
    /** The `Container Type` the client draws. */
    readonly screen: WindowTypes;
    /**
     * Slots the block stores, from `slotsOf`.
     *
     * Zero for a workstation that stores nothing of its own between uses - a crafting table,
     * an anvil, a grindstone - whose slots live in the player's own UI window.
     */
    readonly slots: number;
}

/** The workstations whose slots the client keeps in the player UI rather than in the block. */
const STORES_NOTHING: ReadonlySet<WindowTypes> = new Set([
    WindowTypes.WORKBENCH,
    WindowTypes.ANVIL,
    WindowTypes.ENCHANTMENT,
    WindowTypes.GRINDSTONE,
    WindowTypes.STONECUTTER,
    WindowTypes.CARTOGRAPHY,
    WindowTypes.SMITHING_TABLE,
    WindowTypes.LOOM,
    WindowTypes.BEACON
]);

/**
 * The screen one block opens, or undefined when it opens none.
 *
 * @param identifier - A namespaced block identifier.
 */
export const blockContainerOf = (identifier: string): BlockContainer | undefined => {
    const name = bareName(identifier);
    const screen = name.endsWith('shulker_box')
        ? WindowTypes.CONTAINER
        : name.endsWith('anvil')
          ? WindowTypes.ANVIL
          : SCREENS[name];

    if (screen === undefined) return undefined;

    return { screen, slots: STORES_NOTHING.has(screen) ? 0 : slotsOf(identifier) };
};
