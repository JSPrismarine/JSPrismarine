import type { Module } from '@jsprismarine/kernel';

import AllowList from '../allowlist/AllowList';
import type { AllowListServer } from '../allowlist/AllowList';
import { allowListToken } from './tokens';

/**
 * Provides the {@link AllowList} as `prismarine:allow-list`. Starting the module reads
 * `allowlist.json` and the `allow-list` setting.
 *
 * @param server - The slice of the server the allow list reads.
 * @returns The module to register on the kernel.
 */
export const allowListModule = (server: AllowListServer): Module => {
    const allowList = new AllowList(server);
    return {
        id: 'prismarine:allow-list',
        register: (ctx) => {
            ctx.provide(allowListToken, allowList);
        },
        start: () => allowList.enable(),
        stop: () => allowList.disable()
    };
};
