import { Kernel } from '@jsprismarine/kernel';

import type { ServerEvents } from '../events/ServerEvents';
import { updatesToken } from './tokens';
import type { Updates } from './updates';

/** Updates that have not checked yet, for a command test that does not care what they find. */
export const UNCHECKED_UPDATES: Updates = {
    status: () => ({ state: 'unchecked' }),
    check: async () => ({ state: 'unchecked' }),
    welcome: async () => undefined
};

/**
 * A kernel that provides only these update checks, for a server double whose `getKernel` the
 * commands read the service from.
 */
export const kernelWithUpdates = async (updates: Updates = UNCHECKED_UPDATES): Promise<Kernel<ServerEvents>> => {
    const kernel = new Kernel<ServerEvents>();
    kernel.register({ id: 'test:updates', register: (ctx) => ctx.provide(updatesToken, updates) });
    await kernel.registerAll();
    return kernel;
};
