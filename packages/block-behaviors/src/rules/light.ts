import type { HookBlock } from '@jsprismarine/blocks';

import type { WorldActions } from '../world';

/** Whether a block's data-driven light dampening exceeds the supplied cutoff. */
export const dampensLightMoreThan = (world: WorldActions, block: HookBlock, cutoff: number): boolean => {
    const dampening = world.lightDampeningOf?.(block);
    return dampening !== undefined && dampening > cutoff;
};
