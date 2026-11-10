import { createPrivateKey } from 'node:crypto';

import { TOKEN_ISSUER } from '@jsprismarine/auth';
import type { IAuthProvider } from '@jsprismarine/auth';
import { NetherNetIdentity } from '@jsprismarine/nethernet';

/**
 * The NetherNet identity a provider vouches for: its own key, carrying the multiplayer token
 * Minecraft services issued for that key, as a signed-in game client signs its offer.
 * @param auth - The login identity the client joins as.
 * @returns The identity, or undefined for a provider with no token, which joins self-signed.
 */
export const netherNetIdentityOf = async (auth: IAuthProvider): Promise<NetherNetIdentity | undefined> => {
    const token = await auth.getMultiplayerToken?.();
    if (token === undefined) return undefined;
    return new NetherNetIdentity(createPrivateKey(await auth.getIdentityPrivateKey()), {
        // The client's `cpk` is base64 DER, as its login's is.
        keyFormat: 'der',
        domain: TOKEN_ISSUER,
        token
    });
};
