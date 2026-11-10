import type { Module } from '@jsprismarine/kernel';

import type PacketHandlerRegistry from '../network/PacketHandlerRegistry';
import { packetHandlersToken } from './tokens';

/**
 * Provides the {@link PacketHandlerRegistry} as `prismarine:packet-handlers`. Starting the module
 * registers the handlers; stopping it clears them.
 *
 * @param handlers - The registry the network dispatches inbound packets through.
 * @returns The module to register on the kernel.
 */
export const packetHandlersModule = (handlers: PacketHandlerRegistry): Module => ({
    id: 'prismarine:packet-handlers',
    register: (ctx) => {
        ctx.provide(packetHandlersToken, handlers);
    },
    start: () => handlers.enable(),
    stop: () => handlers.disable()
});
