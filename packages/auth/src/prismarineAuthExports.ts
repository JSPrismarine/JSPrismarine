/**
 * Finds prismarine-auth's exports in the namespace a dynamic import returns, whichever shape the
 * loader gives it. Kept out of the package's exports.
 */
import type { Authflow, Titles } from 'prismarine-auth';
import { AuthErrors } from '@jsprismarine/errors/auth';

import { isRecord } from './isRecord';
import type { XboxTokenSource } from './XboxAuthProvider';

/**
 * The part of prismarine-auth the provider uses. Its own declarations type the public key as a
 * `KeyObject`, but it posts the value as JSON, where only the base64 DER string survives.
 */
export interface PrismarineAuth {
    readonly Authflow: new (...args: ConstructorParameters<typeof Authflow>) => XboxTokenSource;
    readonly Titles: typeof Titles;
}

/**
 * Whether a module namespace carries prismarine-auth's exports. It asks with `in` before reading
 * a name, since some namespaces, such as Vitest's module mocks, throw on a name they lack.
 */
const isPrismarineAuth = (value: unknown): value is PrismarineAuth =>
    isRecord(value) &&
    'Authflow' in value &&
    typeof value.Authflow === 'function' &&
    'Titles' in value &&
    isRecord(value.Titles);

/**
 * prismarine-auth's exports from its imported namespace. It is CommonJS, so a loader that cannot
 * see its named exports, such as tsx, puts them only under `default`.
 */
export const prismarineAuthExports = (namespace: unknown): PrismarineAuth => {
    if (isPrismarineAuth(namespace)) return namespace;
    if (isRecord(namespace) && 'default' in namespace && isPrismarineAuth(namespace.default)) return namespace.default;
    throw new AuthErrors.PrismarineAuthUnrecognized();
};
