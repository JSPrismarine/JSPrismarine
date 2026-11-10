import { randomInt } from 'node:crypto';
import type { ClientDataOptions } from './ClientData';
import { createClientData } from './ClientData';
import type { IAuthProvider, Identity, LoginCredentials, LoginRequest } from './IAuthProvider';
import { IdentityKey } from './IdentityKey';

/**
 * What every provider that holds its own identity key shares: the key, the client data signed
 * with it, and the random id the client picks once. A provider adds where its identity and its
 * chain come from.
 *
 * The key is per instance rather than per login. It is the identity: reusing one across two
 * concurrent connections would have them claim to be the same client, and the encryption
 * handshake would derive the same secret for both.
 */
export abstract class KeyedAuthProvider implements IAuthProvider {
    public abstract readonly name: string;

    /** Mojang's is a signed 32 bit value picked once per session; the server stores it against the player. */
    private readonly clientRandomId = randomInt(0, 0x7fffffff);

    /**
     * @param clientData - Client data fields to send instead of the defaults.
     * @param key - The identity key, a fresh one by default.
     */
    protected constructor(
        private readonly clientData: Partial<ClientDataOptions> = {},
        protected readonly key: IdentityKey = IdentityKey.generate()
    ) {}

    /** The identity this provider logs in as; see {@link IAuthProvider.getIdentity}. */
    public abstract getIdentity(): Promise<Identity>;

    /** The connection request for one login: the chain, or the envelope that carries a token. */
    protected abstract createChainData(request: LoginRequest): Promise<string>;

    /** The chain and the client data, signed for one login. */
    public async createLoginCredentials(request: LoginRequest): Promise<LoginCredentials> {
        const chainData = await this.createChainData(request);
        return { chainData, clientData: await this.signClientData(request, await this.getIdentity()) };
    }

    /** The identity key's public half, base64 DER. */
    public async getIdentityPublicKey(): Promise<string> {
        return this.key.publicKeyDer;
    }

    /** The identity key's private half, PEM-encoded PKCS#8. */
    public async getIdentityPrivateKey(): Promise<string> {
        return this.key.privateKeyPem;
    }

    /** No token by default: nobody vouches for a key a provider only holds. */
    public async getMultiplayerToken(): Promise<string | undefined> {
        return undefined;
    }

    private signClientData(request: LoginRequest, identity: Identity): Promise<string> {
        return this.key.sign(
            createClientData({
                ...this.clientData,
                serverAddress: request.serverAddress,
                clientRandomId: this.clientRandomId,
                selfSignedId: identity.identity,
                // Only a login nobody vouched for carries its name here; a signed-in one's
                // travels in what Xbox Live issued.
                ...(identity.xuid === '' ? { displayName: identity.displayName } : {})
            })
        );
    }
}
