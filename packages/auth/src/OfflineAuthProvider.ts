import { createSigner } from 'fast-jwt';
import { generateKeyPairSync, randomInt, randomUUID } from 'node:crypto';
import { createClientData, type ClientDataOptions } from './ClientData';

import type { IAuthProvider, Identity, LoginCredentials, LoginRequest } from './IAuthProvider';

/**
 * The curve Bedrock's identity keys use, and the JOSE algorithm that goes with it. Not
 * configurable: a server derives its encryption secret from this key, so both ends have to
 * agree, and the protocol fixes the answer.
 */
const CURVE = 'secp384r1';
const ALGORITHM = 'ES384';

/** How long a self-signed chain claims to be valid for. */
const CHAIN_LIFETIME_SECONDS = 6 * 60 * 60;

/**
 * The first protocol whose servers want a multiplayer token rather than a certificate chain.
 *
 * 1.26.10 moved the offline identity out of the chain: what used to be a self-signed link
 * carrying `extraData` is now a self-signed OIDC token in a `Token` field beside a chain that
 * exists only to hold its place. A server at or past this refuses the old shape - and refuses
 * it by going quiet at the RakNet layer rather than by answering, which is why the version
 * this compares against is worth stating rather than discovering.
 */
const FIRST_TOKEN_PROTOCOL = 944;

/** What the token says it is for. A server checks the audience even when it verifies nothing else. */
const MULTIPLAYER_AUDIENCE = 'api://auth-minecraft-services/multiplayer';

/** The value naming a self-signed identity, as opposed to one Xbox Live vouched for. */
const AUTHENTICATION_TYPE_SELF_SIGNED = 2;

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
 * The key is generated per instance rather than per login. It is the identity: reusing one
 * across two concurrent connections would have them claim to be the same client, and the
 * encryption handshake would derive the same secret for both.
 *
 * @example
 * ```typescript
 * const auth = new OfflineAuthProvider({ displayName: 'Steve' });
 * const credentials = await auth.createLoginCredentials({ serverAddress: '127.0.0.1:19132', protocolVersion: 748 });
 * ```
 */
export default class OfflineAuthProvider implements IAuthProvider {
    public readonly name = 'offline';

    private readonly identity: Identity;
    private readonly privateKeyPem: string;
    private readonly publicKeyDer: string;
    private readonly clientRandomId: number;

    public constructor(private readonly options: OfflineAuthOptions) {
        const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: CURVE });

        // DER inside base64, which is the form both the `x5u` header and the
        // `identityPublicKey` claim carry - not PEM, and not a JWK.
        this.publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        this.privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

        this.identity = {
            // Empty, and that is the point: an XUID is what an offline client cannot have,
            // and it is what a server in online mode checks for.
            xuid: '',
            identity: options.identity ?? randomUUID(),
            displayName: options.displayName
        };

        // Mojang's is a signed 32 bit value the client picks once per session and the
        // server stores against the player; nothing derives from it.
        this.clientRandomId = randomInt(0, 0x7fffffff);
    }

    public async getIdentity(): Promise<Identity> {
        return this.identity;
    }

    public async getIdentityPublicKey(): Promise<string> {
        return this.publicKeyDer;
    }

    public async getIdentityPrivateKey(): Promise<string> {
        return this.privateKeyPem;
    }

    public async createLoginCredentials(request: LoginRequest): Promise<LoginCredentials> {
        return {
            chainData:
                request.protocolVersion >= FIRST_TOKEN_PROTOCOL
                    ? this.signTokenRequest()
                    : JSON.stringify({ chain: [this.signChainLink()] }),
            clientData: this.signClientData(request)
        };
    }

    /**
     * The identity as a server from 1.26.10 on wants it.
     *
     * The chain is one empty string. That is not a placeholder for something missing: the
     * field is still read, and an offline client has no certificate to put in it, so it holds
     * a link that says nothing while the `Token` beside it carries the identity. `Certificate`
     * is a *string* of JSON rather than an object, which is the shape the server parses.
     */
    private signTokenRequest(): string {
        return JSON.stringify({
            Certificate: JSON.stringify({ chain: [''] }),
            AuthenticationType: AUTHENTICATION_TYPE_SELF_SIGNED,
            Token: this.signMultiplayerToken()
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
    private signMultiplayerToken(): string {
        const now = Math.floor(Date.now() / 1000);
        const sign = createSigner({
            algorithm: ALGORITHM,
            key: this.privateKeyPem,
            header: { alg: ALGORITHM, x5u: this.publicKeyDer }
        });

        return sign({
            aud: MULTIPLAYER_AUDIENCE,
            nbf: now - CHAIN_LIFETIME_SECONDS,
            exp: now + CHAIN_LIFETIME_SECONDS,
            iat: now,
            ipt: '',
            mid: '',
            tid: '',
            cpk: this.publicKeyDer,
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
    private signChainLink(): string {
        const now = Math.floor(Date.now() / 1000);
        const sign = createSigner({
            algorithm: ALGORITHM,
            key: this.privateKeyPem,
            header: { alg: ALGORITHM, x5u: this.publicKeyDer }
        });

        return sign({
            nbf: now - 60,
            exp: now + CHAIN_LIFETIME_SECONDS,
            iat: now,
            identityPublicKey: this.publicKeyDer,
            extraData: {
                XUID: this.identity.xuid,
                identity: this.identity.identity,
                displayName: this.identity.displayName,
                titleId: this.identity.titleId ?? ''
            }
        });
    }

    private signClientData(request: LoginRequest): string {
        const sign = createSigner({
            algorithm: ALGORITHM,
            key: this.privateKeyPem,
            header: { alg: ALGORITHM, x5u: this.publicKeyDer },
            noTimestamp: true
        });

        return sign(
            createClientData({
                ...this.options.clientData,
                serverAddress: request.serverAddress,
                clientRandomId: this.clientRandomId,
                selfSignedId: this.identity.identity,
                displayName: this.identity.displayName
            })
        );
    }
}
