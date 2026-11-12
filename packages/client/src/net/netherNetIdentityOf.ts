import { createPrivateKey } from 'node:crypto';

import { TOKEN_ISSUER } from '@jsprismarine/auth';
import type { IAuthProvider } from '@jsprismarine/auth';
import { NetherNetIdentity } from '@jsprismarine/nethernet';

/**
 * The NetherNet identity a client signs its offer with: the key its login names. A signed-in
 * provider's carries the multiplayer token Minecraft services issued for that key, as a game
 * client's does; any other signs a token of its own.
 *
 * The key must be the login's, never a fresh one. Bedrock Dedicated Server 1.26.60 accepts a
 * login only on a connection whose offer the login's identity key signed, with `online-mode`
 * off as well, and answers one signed with another key `NotAuthenticated`. This server checks
 * the same in online mode. An offer signed with a throwaway key joins neither.
 * @param auth - The login identity the client joins as.
 * @returns The identity.
 */
export const netherNetIdentityOf = async (auth: IAuthProvider): Promise<NetherNetIdentity> => {
    const key = createPrivateKey(await auth.getIdentityPrivateKey());
    const token = await auth.getMultiplayerToken?.();
    // The client's `cpk` is base64 DER, as its login's is.
    if (token === undefined) return new NetherNetIdentity(key, { keyFormat: 'der' });
    return new NetherNetIdentity(key, { keyFormat: 'der', domain: TOKEN_ISSUER, token });
};
