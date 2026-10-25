/**
 * The pieces more than one family needs.
 *
 * Copper weathering is here rather than in the copper family because the
 * identifier rules send a copper door to `jsprismarine:door` and a copper
 * slab to `jsprismarine:slab`, so six families run the same random tick.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import type { FamilyContext } from '../family';
import { bareName } from '../state';
import type { ItemDrop, WorldActions } from '../world';
import { parseCopperName, WEATHERING_CHANCE, weatheredIdentifier } from '../rules/weathering';

/**
 * Drops one of the block itself.
 *
 * A block whose `jsprismarine:block_properties` says it requires the correct
 * tool drops nothing here, because the hook event carries no held item and
 * the tool check belongs to whoever knows what the breaker was holding.
 */
export const dropSelf = (world: WorldActions, context: FamilyContext, block: HookBlock, count = 1): void => {
    if (context.properties.requiresCorrectTool) return;
    world.dropItem(block.position, { identifier: block.identifier, count });
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

/** Whether an identifier names an iron block, which refuses a bare hand. */
export const isIronOperated = (identifier: string): boolean => bareName(identifier).startsWith('iron_');

/**
 * The item a block drops under its own name, which is the usual case.
 */
export const selfDrop = (block: HookBlock, count = 1): ItemDrop => ({ identifier: block.identifier, count });
