/**
 * The two workstations whose craft the server decides: the enchanting table and the anvil.
 *
 * `enchantment/enchantingTable.ts` and `enchantment/anvil.ts` work out what a row costs and what
 * it produces; this module is the part that knows which slot of which open screen holds the
 * stack they act on, and which `ItemStackRequest` action asks for the result.
 *
 * It is small on purpose. `ItemStackRequestHandler` resolves every slot of the player's own
 * containers, and the only thing it was missing for these two was a place to keep the stack a
 * player drops into the table between the `PLACE` that puts it there and the craft that takes
 * it out. That place is {@link import('../PlayerSession').OpenBlockContainer.inputs}, two slots
 * on the open window, and this module is the mapping between those two slots and the four
 * `ContainerUiId` values the client names them by.
 */
import { ContainerUiId, WindowTypes } from '@jsprismarine/minecraft';

import { bookshelfPowerAround } from '../../enchantment/bookshelves';
import {
    enchantingRows,
    enchantmentSeedOf,
    enchantOptionsOf,
    sendEnchantOptions,
    takeEnchantingRow
} from '../../enchantment/enchantingTable';
import { takeFromAnvil } from '../../enchantment/anvil';
import type { Item } from '../../item/Item';
import type Player from '../../Player';
import type { OpenBlockContainer } from '../PlayerSession';

/** The slot the item being worked on sits in. */
export const WORKSTATION_ITEM = 0;

/** The slot the material sits in: an enchanting table's lapis, an anvil's second item. */
export const WORKSTATION_MATERIAL = 1;

/** Which workstation slot each `ContainerUiId` names, by the screen that owns it. */
const SLOT_IDS: Partial<Record<WindowTypes, readonly [number, number]>> = {
    [WindowTypes.ENCHANTMENT]: [ContainerUiId.ENCHANTING_INPUT_CONTAINER, ContainerUiId.ENCHANTING_MATERIAL_CONTAINER],
    [WindowTypes.ANVIL]: [ContainerUiId.ANVIL_INPUT_CONTAINER, ContainerUiId.ANVIL_MATERIAL_CONTAINER]
};

/**
 * The workstation slot one container name points at, or null when it points at none.
 *
 * @param open - The block container the session has open, or undefined when it has none.
 * @param containerId - The `Container Name` byte off the request.
 */
export const workstationSlotOf = (open: OpenBlockContainer | undefined, containerId: number): number | null => {
    const ids = open === undefined ? undefined : SLOT_IDS[open.screen];
    if (ids === undefined) return null;

    const slot = ids.indexOf(containerId);
    return slot === -1 ? null : slot;
};

/** The `Container Name` the client knows one workstation slot by, for the response. */
export const workstationContainerId = (open: OpenBlockContainer, slot: number): number =>
    SLOT_IDS[open.screen]?.[slot] ?? ContainerUiId.ANVIL_INPUT_CONTAINER;

/** What a workstation craft produced, and what it cost. */
export interface WorkstationCraft {
    /** The finished stack, which the client takes out of the result slot. */
    readonly stack: Item;
    /** Experience levels spent. */
    readonly cost: number;
}

/**
 * Redraws an open enchanting table's three rows for whatever is now in it.
 *
 * Called after any request that moved something into or out of the table, because the rows are
 * a function of the stack. The bookshelf power is worked out here and kept on the window, so
 * that the rows the player is shown and the row {@link takeEnchantOption} later applies are
 * drawn from the same number rather than from two walks of the same bookshelves.
 */
export const refreshEnchantOptions = async (player: Player, open: OpenBlockContainer): Promise<void> => {
    const registry = player.getServer().getContent()?.enchantments;
    const stack = open.inputs[WORKSTATION_ITEM];
    if (registry === undefined || stack === null || stack === undefined || stack.getName() === 'minecraft:air') {
        await sendEnchantOptions(player, []);
        return;
    }

    open.bookshelfPower = await bookshelfPowerAround(player.getWorld(), {
        x: open.position.getX(),
        y: open.position.getY(),
        z: open.position.getZ()
    });

    const rows = enchantingRows(registry, stack, enchantmentSeedOf(player), open.bookshelfPower);
    await sendEnchantOptions(player, enchantOptionsOf(registry, rows));
};

/**
 * Takes one of an enchanting table's three rows.
 *
 * The row is named by the `Recipe Net Id` of a `CRAFTING_RECIPE` action, which for an open
 * enchanting table is the `enchantNetId` this server assigned in `enchantOptionsOf`: one-based,
 * counting within the set of rows the player was offered.
 *
 * `takeEnchantingRow` is what charges for it and rerolls the seed, so a caller cannot enchant
 * twice from one draw, and it redraws the row from the stored seed rather than trusting the
 * client's number for anything but which of the three.
 *
 * @returns Undefined when there is no item in the table, the row is empty, or the player cannot
 *   pay - each of which is a refusal rather than a free enchantment.
 */
export const takeEnchantOption = (
    player: Player,
    open: OpenBlockContainer,
    enchantNetId: number
): WorkstationCraft | undefined => {
    const registry = player.getServer().getContent()?.enchantments;
    const stack = open.inputs[WORKSTATION_ITEM];
    const row = enchantNetId - 1;
    if (registry === undefined || stack === null || stack === undefined) return undefined;
    if (!Number.isInteger(row) || row < 0) return undefined;

    const result = takeEnchantingRow(registry, player, stack, enchantmentSeedOf(player), open.bookshelfPower, row);
    if (result === undefined) return undefined;

    open.inputs[WORKSTATION_ITEM] = null;
    return { stack: result.stack, cost: result.cost };
};

/**
 * Takes an anvil's result: the two inputs combined, renamed to whatever the player typed.
 *
 * The name comes off `Strings To Filter`, which is where a `CRAFTING_RECIPE_OPTIONAL` carries
 * the text a player typed into the anvil's field, indexed by the action's `Filter String Index`.
 *
 * @returns Undefined when there is nothing in the base slot, the combination does nothing, or
 *   the player cannot pay.
 */
export const takeAnvilResult = (
    player: Player,
    open: OpenBlockContainer,
    name?: string
): WorkstationCraft | undefined => {
    const registry = player.getServer().getContent()?.enchantments;
    const base = open.inputs[WORKSTATION_ITEM];
    if (registry === undefined || base === null || base === undefined) return undefined;

    const addition = open.inputs[WORKSTATION_MATERIAL] ?? undefined;
    const outcome = takeFromAnvil(registry, player, { base, addition, name });
    if (outcome === undefined) return undefined;

    open.inputs[WORKSTATION_ITEM] = null;
    open.inputs[WORKSTATION_MATERIAL] = null;
    return { stack: outcome.stack, cost: outcome.cost };
};
