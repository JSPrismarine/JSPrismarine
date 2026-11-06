import { createPublicKey, verify } from 'node:crypto';

import type { JsonWebKey, KeyObject } from 'node:crypto';

import type { Login } from '@jsprismarine/protocol/packet/LoginPacket';

/** Who signs the multiplayer token, and where the keys that check it are published. */
export const TOKEN_ISSUER = 'https://authorization.franchise.minecraft-services.net/';
const KEYS_URL = `${TOKEN_ISSUER}.well-known/keys`;

/** `AuthenticationType.Full` in the connection request: a signed-in Xbox Live account. */
const AUTHENTICATION_FULL = 0;

/** How long the published keys are trusted before they are fetched again. */
const KEY_LIFETIME_MS = 60 * 60 * 1000;
/** The soonest an unknown key id triggers another fetch, so a flood of bad tokens is one request a minute. */
const REFETCH_INTERVAL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
/** Clock drift tolerated when a token says it is not yet valid. */
const CLOCK_SKEW_SECONDS = 60;

/** Where the signing keys come from; a test supplies its own. */
export interface LoginKeySource {
    /** The public key a token's `kid` names, or undefined when the issuer has no such key. */
    keyFor(kid: string): Promise<KeyObject | undefined>;
}

/** A login that cannot be attributed to an account. The message is safe to show the player. */
export class LoginRefused extends Error {
    public constructor(
        message: string,
        /** What went wrong, for the server log. */
        public readonly detail: string
    ) {
        super(message);
        this.name = 'LoginRefused';
    }
}

/** The claims a verified multiplayer token vouches for. */
export interface VerifiedLogin {
    /** The Xbox Live id. */
    readonly xuid: string;
    readonly displayName: string;
    /** The player's persistent uuid when the token carries one. */
    readonly identity: string | undefined;
    /** The client's identity key, base64 DER, which also signed the client data. */
    readonly identityPublicKey: string;
}

interface JsonWebKeySet {
    keys?: Array<JsonWebKey & { kid?: string }>;
}

/**
 * The keys Minecraft services publishes, fetched on demand and kept for an hour.
 *
 * A token naming a key the cache lacks may mean the issuer rotated, so one fetch is allowed for it
 * per minute; past that the answer is "unknown" without a request.
 */
export class MojangKeys implements LoginKeySource {
    private keys = new Map<string, KeyObject>();
    private fetchedAt = Number.NEGATIVE_INFINITY;

    public constructor(
        private readonly fetchKeys: () => Promise<JsonWebKeySet> = defaultFetch,
        private readonly now: () => number = Date.now
    ) {}

    public async keyFor(kid: string): Promise<KeyObject | undefined> {
        const stale = this.now() - this.fetchedAt > KEY_LIFETIME_MS;
        if (stale || (!this.keys.has(kid) && this.now() - this.fetchedAt > REFETCH_INTERVAL_MS)) await this.refresh();
        return this.keys.get(kid);
    }

    private async refresh(): Promise<void> {
        const set = await this.fetchKeys();
        const keys = new Map<string, KeyObject>();
        for (const jwk of set.keys ?? []) {
            if (jwk.kid === undefined || jwk.kty !== 'RSA') continue;
            keys.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
        }
        this.keys = keys;
        this.fetchedAt = this.now();
    }
}

const defaultFetch = async (): Promise<JsonWebKeySet> => {
    const response = await fetch(KEYS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${KEYS_URL} answered ${response.status}`);
    return (await response.json()) as JsonWebKeySet; // a JSON document from the issuer; its shape is checked key by key
};

let shared: LoginKeySource = new MojangKeys();

/** The key source logins are checked against. */
export const loginKeys = (): LoginKeySource => shared;

/** Replaces the key source, for a test; returns a function that puts the old one back. */
export const useLoginKeys = (keys: LoginKeySource): (() => void) => {
    const previous = shared;
    shared = keys;
    return () => {
        shared = previous;
    };
};

const parseSegment = (segment: string | undefined, what: string): Record<string, unknown> => {
    if (segment === undefined) throw new LoginRefused('Invalid login!', `${what} is not a JWT`);
    try {
        const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
        if (typeof value === 'object' && value !== null && !Array.isArray(value))
            return value as Record<string, unknown>; // narrowed to a non-array object just above
    } catch {
        // fall through to the refusal below
    }
    throw new LoginRefused('Invalid login!', `${what} is not valid JSON`);
};

const text = (claims: Record<string, unknown>, name: string): string | undefined => {
    const value = claims[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * Checks that a login belongs to the account it names.
 *
 * Two signatures carry that. The multiplayer token is signed by Minecraft services and states the
 * account and the client's identity key (`cpk`); the client data, which holds the skin and device,
 * is signed by that key. Together they say that whoever holds the key was issued this account, and
 * that the data in the login came from them. Everything else in the connection request is ignored:
 * a certificate chain is not evidence of an account.
 *
 * Fails closed. A missing token, an unknown key, an expired or foreign token, a bad signature and
 * an issuer that cannot be reached each refuse the login.
 * @param login - The decoded login packet.
 * @param keys - Where to find the issuer's public keys.
 * @param now - The current time in milliseconds, for expiry.
 * @throws {LoginRefused} when the login cannot be attributed to an account.
 */
export const verifyLogin = async (
    login: Login,
    keys: LoginKeySource = loginKeys(),
    now: number = Date.now()
): Promise<VerifiedLogin> => {
    let request: Record<string, unknown>;
    try {
        const parsed: unknown = JSON.parse(login.chainData);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
        request = parsed as Record<string, unknown>; // narrowed to a non-array object just above
    } catch {
        throw new LoginRefused('Invalid login!', 'the connection request is not a JSON object');
    }

    if (request.AuthenticationType !== AUTHENTICATION_FULL) {
        throw new LoginRefused(
            'Please sign in to Xbox Live to join.',
            `authentication type ${String(request.AuthenticationType)}`
        );
    }
    const token = text(request, 'Token');
    if (token === undefined) throw new LoginRefused('Please sign in to Xbox Live to join.', 'no token');

    const [header64, claims64, signature64, ...extra] = token.split('.');
    if (extra.length > 0 || header64 === undefined || claims64 === undefined || signature64 === undefined) {
        throw new LoginRefused('Invalid login!', 'the token is not a JWT');
    }

    const header = parseSegment(header64, 'the token header');
    // The algorithm is fixed by the issuer, never read from the token, or a token could choose
    // its own check ("none", or a MAC keyed with the public key).
    if (header.alg !== 'RS256') throw new LoginRefused('Invalid login!', `token algorithm ${String(header.alg)}`);
    const kid = text(header, 'kid');
    if (kid === undefined) throw new LoginRefused('Invalid login!', 'the token names no key');

    let key: KeyObject | undefined;
    try {
        key = await keys.keyFor(kid);
    } catch (error: unknown) {
        throw new LoginRefused(
            'Could not verify your account right now. Please try again.',
            `the issuer's keys could not be fetched: ${error instanceof Error ? error.message : String(error)}`
        );
    }
    if (key === undefined) throw new LoginRefused('Invalid login!', `unknown token key ${kid}`);

    const signed = Buffer.from(`${header64}.${claims64}`);
    if (!verify('RSA-SHA256', signed, key, Buffer.from(signature64, 'base64url'))) {
        throw new LoginRefused('Invalid login!', 'the token signature does not match');
    }

    const claims = parseSegment(claims64, 'the token claims');
    if (claims.iss !== TOKEN_ISSUER) throw new LoginRefused('Invalid login!', `token issuer ${String(claims.iss)}`);
    const seconds = now / 1000;
    if (typeof claims.exp !== 'number' || claims.exp <= seconds)
        throw new LoginRefused('Your login has expired.', 'the token has expired');
    if (typeof claims.nbf === 'number' && claims.nbf > seconds + CLOCK_SKEW_SECONDS) {
        throw new LoginRefused('Invalid login!', 'the token is not valid yet');
    }

    const xuid = text(claims, 'xid');
    const displayName = text(claims, 'xname');
    const identityPublicKey = text(claims, 'cpk');
    if (xuid === undefined || displayName === undefined || identityPublicKey === undefined) {
        throw new LoginRefused('Invalid login!', 'the token lacks an account or a client key');
    }

    verifyClientData(login.clientData, identityPublicKey);

    return { xuid, displayName, identity: text(claims, 'leguuid'), identityPublicKey };
};

/** The client data must be signed by the key the token vouches for. */
const verifyClientData = (clientData: string, identityPublicKey: string): void => {
    const [header64, claims64, signature64, ...extra] = clientData.split('.');
    if (extra.length > 0 || header64 === undefined || claims64 === undefined || signature64 === undefined) {
        throw new LoginRefused('Invalid login!', 'the client data is not a JWT');
    }

    const header = parseSegment(header64, 'the client data header');
    if (header.alg !== 'ES384') throw new LoginRefused('Invalid login!', `client data algorithm ${String(header.alg)}`);

    let key: KeyObject;
    try {
        key = createPublicKey({ key: Buffer.from(identityPublicKey, 'base64'), format: 'der', type: 'spki' });
    } catch {
        throw new LoginRefused('Invalid login!', 'the token names an unusable client key');
    }

    const valid = verify(
        'sha384',
        Buffer.from(`${header64}.${claims64}`),
        { key, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature64, 'base64url')
    );
    if (!valid) throw new LoginRefused('Invalid login!', 'the client data is not signed by the account key');
};
