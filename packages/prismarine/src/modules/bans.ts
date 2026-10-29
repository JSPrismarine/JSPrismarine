import type { Module } from '@jsprismarine/kernel';

import BanManager from '../ban/BanManager';
import type { BanManagerServer } from '../ban/BanManager';
import { bansToken } from './tokens';

/**
 * Provides the {@link BanManager} as `prismarine:bans`. Starting the module
 * loads the ban file; stopping it clears the loaded list.
 *
 * @param server - The slice of the server the ban manager reads.
 * @returns The module to register on the kernel.
 */
export const bansModule = (server: BanManagerServer): Module => {
    const bans = new BanManager(server);
    return {
        id: 'prismarine:bans',
        register: (ctx) => {
            ctx.provide(bansToken, bans);
        },
        start: () => bans.enable(),
        stop: () => bans.disable()
    };
};
