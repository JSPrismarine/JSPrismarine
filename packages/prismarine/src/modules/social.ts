import type { Module } from '@jsprismarine/kernel';

import { ChatManager } from '../chat/ChatManager';
import type Server from '../Server';
import { chatToken } from './tokens';

/**
 * Provides the {@link ChatManager} as `prismarine:chat`, a stateless forwarder
 * with no lifecycle of its own. The query protocol it once shared this module
 * with is part of the server's networking now.
 *
 * @param server - The server the manager forwards through.
 * @returns The module to register on the kernel.
 */
export const socialModule = (server: Server): Module => ({
    id: 'prismarine:social',
    register: (ctx) => {
        ctx.provide(chatToken, new ChatManager(server));
    }
});
