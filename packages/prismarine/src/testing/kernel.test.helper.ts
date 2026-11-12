import type { Kernel } from '@jsprismarine/kernel';
import { KernelEventBus } from '@jsprismarine/kernel';

import type { ServerEvents } from '../events/ServerEvents';
import { stub } from './stub.test.helper';

/**
 * A kernel double whose only part is its event bus, for a server double whose code raises the
 * server's events.
 * @param events - The bus, a fresh one by default. Pass one to listen on it.
 * @returns The kernel double.
 */
export const testKernel = (events = new KernelEventBus<ServerEvents>()): Kernel<ServerEvents> =>
    stub<Kernel<ServerEvents>>({ events });
