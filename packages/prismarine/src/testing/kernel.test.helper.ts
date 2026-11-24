import { KernelErrors } from '@jsprismarine/errors/kernel';
import type { Kernel, ServiceToken } from '@jsprismarine/kernel';
import { KernelEventBus } from '@jsprismarine/kernel';

import type { ServerEvents } from '../events/ServerEvents';
import { AccountLinks } from '../identity/AccountLinks';
import { accountLinksToken } from '../modules/tokens';
import { stub } from './stub.test.helper';

/**
 * A kernel double whose only parts are its event bus and the account links, for a server double
 * whose code raises the server's events.
 * @param events - The bus, a fresh one by default. Pass one to listen on it.
 * @param links - The account links, by default none with linking off, so a login plays as the
 *   account it logged in with.
 * @returns The kernel double.
 */
export const testKernel = (
    events = new KernelEventBus<ServerEvents>(),
    links = new AccountLinks({ load: async () => [], save: async () => {} }, () => false)
): Kernel<ServerEvents> => {
    return stub<Kernel<ServerEvents>>({
        events,
        get: <T>(token: ServiceToken<T>): T => {
            // The token's type parameter is erased at run time; the identity check is what ties it to `links`.
            if (token === accountLinksToken) return links as T;
            throw new KernelErrors.ServiceNotProvidedYet({ id: token.id });
        }
    });
};
