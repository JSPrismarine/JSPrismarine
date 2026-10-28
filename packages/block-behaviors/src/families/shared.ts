/**
 * The pieces more than one family needs.
 *
 * Copper weathering is here rather than in the copper family because the
 * identifier rules send a copper door to `jsprismarine:door` and a copper
 * slab to `jsprismarine:slab`, so six families run the same random tick.
 */
import type { HookBlock, HookItem } from '@jsprismarine/blocks';

import type { FamilyHandlers } from '../family';
import { isAxe, isHoneycomb } from '../rules/heldItem';
import { bareName } from '../state';
import type { ItemDrop, WorldActions } from '../world';
import {
    parseCopperName,
    scrapedIdentifier,
    waxedIdentifier,
    WEATHERING_CHANCE,
    weatheredIdentifier
} from '../rules/weathering';

/**
 * Proposes one of the block itself as a drop. The content break host checks
 * `requires_correct_tool` against the held item's data before releasing it.
 *
 * @param carried - What the dropped stack keeps of the block it came from,
 *   which is how a shulker box leaves with the items it was holding.
 */
export const dropSelf = (
    world: WorldActions,
    block: HookBlock,
    count = 1,
    carried: Omit<ItemDrop, 'identifier' | 'count'> = {}
): void => {
    world.dropItem(block.position, { ...carried, identifier: block.identifier, count });
};

/** Drops a list of items at a block, leaving out the empty ones. */
export const dropAll = (world: WorldActions, block: HookBlock, drops: readonly ItemDrop[]): void => {
    for (const drop of drops) {
        if (drop.count > 0) world.dropItem(block.position, drop);
    }
};

/**
 * Advances a copper block one oxidation stage, at the rate an isolated block
 * weathers.
 *
 * @returns True when the block oxidized.
 */
export const weatherOnRandomTick = (world: WorldActions, block: HookBlock): boolean => {
    const next = weatheredIdentifier(block.identifier);
    if (next === undefined) return false;
    if (world.random() >= WEATHERING_CHANCE) return false;
    world.setBlock(block.position, next, block.states);
    return true;
};

/** Whether a block is one of the copper blocks that oxidize. */
export const isWeatheringCopper = (identifier: string): boolean => parseCopperName(identifier) !== undefined;

/** Whether honeycomb has already sealed a copper block against oxidation. */
export const isWaxedCopper = (identifier: string): boolean => parseCopperName(identifier)?.waxed === true;

/**
 * Waxes a copper block with honeycomb or scrapes one with an axe.
 *
 * An axe takes the wax off first and only oxidation after, which is the order
 * Bedrock applies the two, so scraping a waxed weathered block twice gets
 * back to exposed copper.
 *
 * @returns True when the item changed the block, which is what the handler
 *   returns to consume the interaction. False leaves the interaction for the
 *   next handler and for the item's own use.
 */
export const waxOrScrapeOnInteract = (world: WorldActions, block: HookBlock, item: HookItem | undefined): boolean => {
    if (isHoneycomb(item)) {
        const waxed = waxedIdentifier(block.identifier);
        if (waxed === undefined) return false;
        world.setBlock(block.position, waxed, block.states);
        world.playSound(block.position, 'copper.wax.on');
        return true;
    }

    if (!isAxe(item)) return false;
    const scraped = scrapedIdentifier(block.identifier);
    if (scraped === undefined) return false;
    const unwaxing = isWaxedCopper(block.identifier);
    world.setBlock(block.position, scraped, block.states);
    world.playSound(block.position, unwaxing ? 'copper.wax.off' : 'scrape');
    return true;
};

/**
 * The `onPlayerInteract` handler for a copper family whose only interaction
 * is waxing and scraping. A block that is not copper, or an item that is
 * neither honeycomb nor an axe, declines so the next handler sees it.
 */
export const waxOrScrapeHandler: NonNullable<FamilyHandlers['onPlayerInteract']> = (event, world) =>
    waxOrScrapeOnInteract(world, event.block, event.itemStack) ? true : undefined;

/** Whether an identifier names an iron block, which refuses a bare hand. */
export const isIronOperated = (identifier: string): boolean => bareName(identifier).startsWith('iron_');

/**
 * The item a block drops under its own name, which is the usual case.
 */
export const selfDrop = (block: HookBlock, count = 1): ItemDrop => ({ identifier: block.identifier, count });
