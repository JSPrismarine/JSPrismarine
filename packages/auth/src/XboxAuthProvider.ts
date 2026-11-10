import type { KeyObject } from 'node:crypto';
import type { ClientDataOptions } from './ClientData';
import type { Identity, LoginRequest } from './IAuthProvider';
import type { IdentityKey } from './IdentityKey';
import { decodeJwt } from 'jose';
import { textClaim } from './claims';
import { isRecord } from './isRecord';
import { KeyedAuthProvider } from './KeyedAuthProvider';
import { AuthenticationType, FIRST_TOKEN_PROTOCOL, MOJANG_ROOT_KEY } from './protocol';

/** How long the client's own chain link claims to be valid for. */
const OWN_LINK_LIFETIME_SECONDS = 6 * 60 * 60;

/** How long before its expiry a multiplayer token is replaced, so a login never carries one about to lapse. */
const TOKEN_REFRESH_MARGIN_SECONDS = 5 * 60;

/** What Xbox Live issues for an identity key: Mojang's chain for it, and the multiplayer token. */
export interface XboxLogin {
    /** The chain Minecraft services signed, starting with the link that names the client's key. */
    readonly chain: readonly string[];
    /** The multiplayer token, whose `cpk` claim is the client's key. */
    readonly token: string;
}

/** A sign-in: what was issued, the account it names, and when its token expires (milliseconds). */
interface SignedIn {
    readonly login: XboxLogin;
    readonly identity: Identity;
    readonly expiresAt: number;
}

/**
 * Where a signed-in account's tokens come from. prismarine-auth's `Authflow` fits; a test
 * supplies its own.
 */
export interface XboxTokenSource {
    /**
     * Signs in, or reuses a cached sign-in, and has Minecraft services issue a chain and a
     * multiplayer token for the key.
     */
    getMinecraftBedrockToken(publicKey: KeyObject): Promise<{ chain: string[]; token?: string }>;
}

/** The code a person enters to sign in, the first time an account is used. */
export interface DeviceCode {
    /** The code to enter. */
    readonly userCode: string;
    /** Where to enter it. */
    readonly verificationUri: string;
    /** How long the code is good for. */
    readonly expiresInSeconds: number;
    /** Microsoft's own instruction, naming both. */
    readonly message: string;
}

/** How {@link XboxAuthProvider} signs in. */
export interface XboxAuthOptions {
    /**
     * The name the sign-in is cached under, so several accounts can share a cache directory.
     * Defaults to `default`.
     */
    readonly account?: string;
    /** Where prismarine-auth keeps the sign-in between runs. Defaults to its own location. */
    readonly cacheDirectory?: string;
    /**
     * Called with the device code when nobody is signed in yet. Without it prismarine-auth
     * prints the code itself.
     */
    readonly onDeviceCode?: (code: DeviceCode) => void;
    /** Where the tokens come from. Defaults to prismarine-auth, which must then be installed. */
    readonly tokens?: XboxTokenSource;
    readonly clientData?: Partial<ClientDataOptions>;
    /** The identity key, a fresh one by default. */
    readonly key?: IdentityKey;
    /** The clock, in milliseconds since the epoch. */
    readonly now?: () => number;
}

/**
 * The tokens prismarine-auth issues, signing in as the Nintendo Switch title, which is what
 * the other Bedrock clients built on it do. It is an optional peer dependency, loaded only
 * when a provider first signs in, so nothing that stays offline loads it.
 */
const prismarineAuth = (options: XboxAuthOptions): XboxTokenSource => {
    let flow: Promise<XboxTokenSource> | undefined;
    const load = async (): Promise<XboxTokenSource> => {
        let module: typeof import('prismarine-auth');
        try {
            module = await import('prismarine-auth');
        } catch (error: unknown) {
            throw new Error('XboxAuthProvider signs in through prismarine-auth; install it beside @jsprismarine/auth', {
                cause: error
            });
        }
        const onDeviceCode = options.onDeviceCode;
        return new module.Authflow(
            options.account ?? 'default',
            options.cacheDirectory,
            { authTitle: module.Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo', flow: 'live' },
            onDeviceCode &&
                ((code) =>
                    onDeviceCode({
                        userCode: code.user_code,
                        verificationUri: code.verification_uri,
                        expiresInSeconds: code.expires_in,
                        message: code.message
                    }))
        );
    };
    return {
        getMinecraftBedrockToken: async (publicKey) => {
            flow ??= load();
            return (await flow).getMinecraftBedrockToken(publicKey);
        }
    };
};

/**
 * A login identity an Xbox Live account vouches for, which is what a server in online mode
 * admits.
 *
 * Minecraft services issues a chain and a multiplayer token for the provider's key. The login
 * puts a link of the client's own in front of the chain, naming Mojang's root key as the next
 * signer, and from 1.26.10 on carries the token beside it. NetherNet signs its WebRTC offer
 * with the same token.
 *
 * Signing in happens on first use, and asks for a device code when the cache has no account;
 * after that the cached sign-in is reused, and the token is fetched again shortly before it
 * expires.
 *
 * @example
 * ```typescript
 * const auth = new XboxAuthProvider({
 *     cacheDirectory: './auth-cache',
 *     onDeviceCode: (code) => console.log(code.message)
 * });
 * const client = new Client({ host: 'example.com', auth });
 * ```
 */
export default class XboxAuthProvider extends KeyedAuthProvider {
    public readonly name = 'xbox';

    private readonly tokens: XboxTokenSource;
    private readonly now: () => number;
    private login: Promise<SignedIn> | undefined;

    public constructor(options: XboxAuthOptions = {}) {
        super(options.clientData, options.key);
        this.tokens = options.tokens ?? prismarineAuth(options);
        this.now = options.now ?? Date.now;
    }

    /** Signs in if nobody has yet. */
    public async getIdentity(): Promise<Identity> {
        return (await this.signIn()).identity;
    }

    /** The multiplayer token issued for this provider's key. Signs in if nobody has yet. */
    public async getMultiplayerToken(): Promise<string> {
        return (await this.signIn()).login.token;
    }

    protected async createChainData(request: LoginRequest): Promise<string> {
        const { login } = await this.signIn();
        const chain = [await this.signOwnLink(), ...login.chain];
        if (request.protocolVersion < FIRST_TOKEN_PROTOCOL) return JSON.stringify({ chain });
        return JSON.stringify({
            Certificate: JSON.stringify({ chain }),
            AuthenticationType: AuthenticationType.Full,
            Token: login.token
        });
    }

    /** The sign-in, reused until its token is close to expiring. A failed one is not kept. */
    private async signIn(): Promise<SignedIn> {
        const current = this.login ?? this.fetch();
        const signedIn = await current;
        if (signedIn.expiresAt - TOKEN_REFRESH_MARGIN_SECONDS * 1000 > this.now()) return signedIn;
        // Whoever finds it stale first fetches again; everyone else waits for that.
        return this.login === current ? this.fetch() : (this.login ?? this.fetch());
    }

    private fetch(): Promise<SignedIn> {
        const pending = this.tokens.getMinecraftBedrockToken(this.key.publicKey).then(({ chain, token }) => {
            if (token === undefined || token === '') {
                throw new Error('Minecraft services issued no multiplayer token for this account');
            }
            const login: XboxLogin = { chain, token };
            return { login, identity: identityOf(login), expiresAt: expiryOf(token) };
        });
        this.login = pending;
        pending.catch(() => {
            if (this.login === pending) this.login = undefined;
        });
        return pending;
    }

    /**
     * The link in front of Mojang's chain: signed by the client's key, naming Mojang's root key
     * as the one that signs the next link.
     */
    private signOwnLink(): Promise<string> {
        const now = Math.floor(this.now() / 1000);
        return this.key.sign({
            certificateAuthority: true,
            identityPublicKey: MOJANG_ROOT_KEY,
            nbf: now - 60,
            exp: now + OWN_LINK_LIFETIME_SECONDS
        });
    }
}

/** The account a chain names: its last link's `extraData`. */
const identityOf = (login: XboxLogin): Identity => {
    const last = login.chain.at(-1);
    // Read without checking the signature: this side was issued the chain, and the server checks it.
    const extraData = last === undefined ? undefined : unverifiedClaims(last).extraData;
    const claims = isRecord(extraData) ? extraData : {};
    const xuid = textClaim(claims, 'XUID');
    const identity = textClaim(claims, 'identity');
    const displayName = textClaim(claims, 'displayName');
    if (xuid === undefined || identity === undefined || displayName === undefined) {
        throw new Error('The chain Minecraft services issued names no account');
    }
    const titleId = textClaim(claims, 'titleId');
    return titleId === undefined ? { xuid, identity, displayName } : { xuid, identity, displayName, titleId };
};

/** When a token expires, in milliseconds since the epoch; the epoch itself, so already, for a token without one. */
const expiryOf = (token: string): number => {
    const exp = unverifiedClaims(token).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
};

/** A token's claims without checking its signature, or none for one that is not a JWT. */
const unverifiedClaims = (token: string): Readonly<Record<string, unknown>> => {
    try {
        return decodeJwt(token);
    } catch {
        return {};
    }
};
