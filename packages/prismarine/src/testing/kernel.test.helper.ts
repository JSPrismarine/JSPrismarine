import { KernelErrors } from '@jsprismarine/errors/kernel';
import type { Kernel, ServiceToken } from '@jsprismarine/kernel';
import { KernelEventBus } from '@jsprismarine/kernel';

import type { ServerEvents } from '../events/ServerEvents';
import { AccountLinks } from '../identity/AccountLinks';
import { accountLinksToken } from '../modules/tokens';
import { stub } from './stub.test.helper';

/**
 * A kernel double whose only part is its event bus, for a server double whose code raises the
 * server's events.
 * @param events - The bus, a fresh one by default. Pass one to listen on it.
 * @returns The kernel double.
 */
export const testKernel = (events = new KernelEventBus<ServerEvents>()): Kernel<ServerEvents> => {
    // No links, and linking off: a login plays as the account it logged in with.
    const links = new AccountLinks({ load: async () => [], save: async () => {} }, () => false);
    return stub<Kernel<ServerEvents>>({
        events,
        get: <T>(token: ServiceToken<T>): T => {
            // The token's type parameter is erased at run time; the identity check is what ties it to `links`.
            if (token === accountLinksToken) return links as T;
            throw new KernelErrors.ServiceNotProvidedYet({ id: token.id });
        }
    });
};
