/**
 * Registers the `@minecraft/server` members of blocks, items and containers that the modules of
 * this folder implement, beside the ones `serverBlocks.ts`, `serverItems.ts` and
 * `serverComponents.ts` register.
 *
 * Left without behavior, because JSPrismarine gives the script host no seam to the system behind
 * them yet: the sign, piston, jukebox and cauldron components (#3302), the redstone producer and
 * instrument components (#3303), `Block.liquidCanFlowFromDirection` (#3304), item containers
 * (#3305), the crafter, entity storage, block dynamic property and custom component instance
 * classes (#3306), and named ticks, which wait for the `onNamedTick` hook (#3297, #3307). The
 * `Enchant*` loot functions and `BannerPattern` come only from loot tables and banners, which the
 * script host does not hand out yet.
 */
import type { ScriptApiImplementations } from '../../shape/implementations';
import type { PackHost } from '../minecraftServer';
import { implementBlockComponents } from './blockComponents';
import { implementBlockMembers } from './blocks';
import { implementContainers } from './containers';
import { implementItemMembers } from './items';
import { implementTypes } from './types';
import { implementVolumes } from './volumes';

/**
 * Registers the members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementBlocksAndItems = (implementations: ScriptApiImplementations, host: PackHost): void => {
    implementVolumes(implementations, host);
    implementTypes(implementations, host);
    implementBlockMembers(implementations, host);
    implementItemMembers(implementations, host);
    implementContainers(implementations, host);
    implementBlockComponents(implementations, host);
};
