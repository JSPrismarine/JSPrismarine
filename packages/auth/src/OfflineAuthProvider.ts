import { randomUUID } from 'node:crypto';
import type { ClientDataOptions } from './ClientData';
import type { Identity, LoginRequest } from './IAuthProvider';
import type { IdentityKey } from './IdentityKey';
import { KeyedAuthProvider } from './KeyedAuthProvider';
import { AuthenticationType, FIRST_TOKEN_PROTOCOL, MULTIPLAYER_AUDIENCE } from './protocol';

/** How long a self-signed chain claims to be valid for. */
const CHAIN_LIFETIME_SECONDS = 6 * 60 * 60;

export interface OfflineAuthOptions {
    /** The name that shows up in chat and the player list. */
    readonly displayName: string;
    /**
     * The uuid the server knows this player by, stable across reconnects if you supply it.
     *
     * Worth supplying for a client with a world to come back to, and worth *not* supplying
     * for a bot fleet, where five hundred connections each need their own.
     */
    readonly identity?: string;
    readonly clientData?: Partial<ClientDataOptions>;
    /** The identity key, a fresh one by default. */
    readonly key?: IdentityKey;
}

/**
 * A login identity that talks to nothing.
 *
 * The chain is a single JWT this provider signs with a key it just generated, which is
 * exactly what the real client sends when it is not signed in to Xbox Live. A server in
 * online mode refuses it - there is no XUID to check, and it says so - and a server with
 * `online-mode` off accepts it, which covers JSPrismarine itself, a LAN game, and the
 * whole of the bot harness.
 *
 * @example
 * ```typescript
 * const auth = new OfflineAuthProvider({ displayName: 'Steve' });
 * const credentials = await auth.createLoginCredentials({ serverAddress: '127.0.0.1:19132', protocolVersion: 748 });
 * ```
 */
export default class OfflineAuthProvider extends KeyedAuthProvider {
    public readonly name = 'offline';

    private readonly identity: Identity;

    public constructor(options: OfflineAuthOptions) {
        super(options.clientData, options.key);
        this.identity = {
            // Empty, and that is the point: an XUID is what an offline client cannot have,
            // and it is what a server in online mode checks for.
            xuid: '',
            identity: options.identity ?? randomUUID(),
            displayName: options.displayName
        };
    }

    public async getIdentity(): Promise<Identity> {
        return this.identity;
    }

    protected async createChainData(request: LoginRequest): Promise<string> {
        return request.protocolVersion >= FIRST_TOKEN_PROTOCOL
            ? this.signTokenRequest()
            : JSON.stringify({ chain: [await this.signChainLink()] });
    }

    /**
     * The identity as a server from 1.26.10 on wants it.
     *
     * The chain is one empty string. That is not a placeholder for something missing: the
     * field is still read, and an offline client has no certificate to put in it, so it holds
     * a link that says nothing while the `Token` beside it carries the identity. `Certificate`
     * is a *string* of JSON rather than an object, which is the shape the server parses.
     */
    private async signTokenRequest(): Promise<string> {
        return JSON.stringify({
            Certificate: JSON.stringify({ chain: [''] }),
            AuthenticationType: AuthenticationType.SelfSigned,
            Token: await this.signMultiplayerToken()
        });
    }

    /**
     * The self-signed token that replaced the chain link.
     *
     * The claim names are short and unobvious because they are an identity provider's, not
     * Minecraft's: `cpk` is the key the encryption handshake will use, `xid` the Xbox id an
     * offline player does not have, `leguuid` the uuid that has to stand in for it. The
     * PlayFab fields are sent empty rather than omitted, because a real client always sends
     * them and a field that is present-and-empty is the smaller departure from that.
     */
    private signMultiplayerToken(): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        return this.key.sign({
            aud: MULTIPLAYER_AUDIENCE,
            nbf: now - CHAIN_LIFETIME_SECONDS,
            exp: now + CHAIN_LIFETIME_SECONDS,
            iat: now,
            ipt: '',
            mid: '',
            tid: '',
            cpk: this.key.publicKeyDer,
            xid: this.identity.xuid,
            xname: this.identity.displayName,
            leguuid: this.identity.identity
        });
    }

    /**
     * The one link an unauthenticated chain has: self-signed, and vouching for nothing but
     * itself.
     *
     * The `x5u` header and the `identityPublicKey` claim are the same key, which is how a
     * verifier knows the token signed itself. An authenticated chain has Mojang's key in
     * `x5u` and this one in the claim, and the difference between the two is the whole of
     * what online mode checks.
     */
    private signChainLink(): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        return this.key.sign({
            nbf: now - 60,
            exp: now + CHAIN_LIFETIME_SECONDS,
            iat: now,
            identityPublicKey: this.key.publicKeyDer,
            extraData: {
                XUID: this.identity.xuid,
                identity: this.identity.identity,
                displayName: this.identity.displayName,
                titleId: this.identity.titleId ?? ''
            }
        });
    }
}
