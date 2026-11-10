import type { IAuthProvider } from './IAuthProvider';
import type { OfflineAuthOptions } from './OfflineAuthProvider';
import OfflineAuthProvider from './OfflineAuthProvider';
import type { XboxAuthOptions } from './XboxAuthProvider';
import XboxAuthProvider from './XboxAuthProvider';

/** A provider chosen by name, with that provider's options: the shape a config file or a command line gives. */
export type AuthProviderOptions =
    ({ readonly provider: 'offline' } & OfflineAuthOptions) | ({ readonly provider: 'xbox' } & XboxAuthOptions);

/** The names {@link createAuthProvider} knows. */
export type AuthProviderName = AuthProviderOptions['provider'];

/**
 * Builds the provider a setting names, so an application picks one at its edge without
 * importing each.
 * @param options - The provider's name and its options.
 * @example
 * ```typescript
 * const auth = createAuthProvider(signedIn ? { provider: 'xbox' } : { provider: 'offline', displayName: 'Steve' });
 * ```
 */
export const createAuthProvider = (options: AuthProviderOptions): IAuthProvider =>
    options.provider === 'xbox' ? new XboxAuthProvider(options) : new OfflineAuthProvider(options);
