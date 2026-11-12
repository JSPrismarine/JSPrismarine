/**
 * The scenarios a pinned cinnabar build skips. Read `skips.mts` for what an entry must say, and the
 * client-e2e README for when a skip is acceptable. A skip names a build by its commit, so moving a
 * pin in `cinnabar.json` makes every skip written for the old commit fail validation until someone
 * re-checks it.
 */
import type { ScenarioSkip } from './skips.mts';

export const pinSkips: ScenarioSkip[] = [];
