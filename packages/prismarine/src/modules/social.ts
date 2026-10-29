import type { Module } from '@jsprismarine/kernel';

import { ChatManager } from '../chat/ChatManager';
import { QueryManager } from '../query/QueryManager';
import type Server from '../Server';
import { chatToken, queryToken } from './tokens';

/**
 * Provides the {@link ChatManager} and {@link QueryManager} as
 * `prismarine:chat` and `prismarine:query`. One module for both: each is a
 * stateless forwarder with no lifecycle of its own, too small to carry a
 * module each.
 *
 * @param server - The server the managers forward through.
 * @returns The module to register on the kernel.
 */
export const socialModule = (server: Server): Module => ({
    id: 'prismarine:social',
    register: (ctx) => {
        ctx.provide(chatToken, new ChatManager(server));
        ctx.provide(queryToken, new QueryManager(server));
    }
});
