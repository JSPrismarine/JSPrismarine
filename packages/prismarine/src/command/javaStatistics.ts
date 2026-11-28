/**
 * The entries each Java Edition statistic type counts, which a statistic scoreboard criterion
 * such as `minecraft.mined:minecraft.stone` is checked against: the newest Java release's own
 * registries, since a criterion names Java's ids.
 */
import type { StatisticEntries } from '@jsprismarine/commands/criteria';
import { BLOCK_STATES, CUSTOM_STATS, ENTITY_TYPES, ITEMS } from '@jsprismarine/protocol/java/versions/newest';

/**
 * Each statistic type's registry, as `Stats` makes them.
 *
 * @javaSee Stats.BLOCK_MINED
 * @javaSee Stats.CUSTOM
 */
export const JAVA_STATISTICS: StatisticEntries = {
    'minecraft:mined': BLOCK_STATES.blocks,
    'minecraft:crafted': ITEMS.entries,
    'minecraft:used': ITEMS.entries,
    'minecraft:broken': ITEMS.entries,
    'minecraft:picked_up': ITEMS.entries,
    'minecraft:dropped': ITEMS.entries,
    'minecraft:killed': ENTITY_TYPES.entries,
    'minecraft:killed_by': ENTITY_TYPES.entries,
    'minecraft:custom': CUSTOM_STATS.entries
};
