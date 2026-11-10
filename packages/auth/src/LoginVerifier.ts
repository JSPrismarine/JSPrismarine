import { createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { compactVerify, createRemoteJWKSet, customFetch, errors, jwtVerify } from 'jose';
import type { FetchImplementation, JWTPayload } from 'jose';
import { textClaim } from './claims';
import type { LoginCredentials } from './IAuthProvider';
import { isRecord } from './isRecord';
import { AuthenticationType, TOKEN_ISSUER } from './protocol';

const KEYS_URL = new URL('.well-known/keys', TOKEN_ISSUER);

/** How long the published keys are trusted before they are fetched again. */
const KEY_LIFETIME_MS = 60 * 60 * 1000;
/** The soonest an unknown key id triggers another fetch, so a flood of bad tokens is one request a minute. */
const REFETCH_INTERVAL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
/** Clock drift tolerated on a token's `exp` and `nbf`. */
const CLOCK_SKEW_SECONDS = 60;

/** A key `jose` verifies with. */
export type VerificationKey = CryptoKey | KeyObject;

/** Where the signing keys come from; a test supplies its own. */
export interface LoginKeySource {
    /** The public key a token's `kid` names, or undefined when the issuer has no such key. */
    keyFor(kid: string): Promise<VerificationKey | undefined>;
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

/**
 * The keys Minecraft services publishes, fetched on demand and kept for an hour, through
 * `jose`'s remote key set.
 *
 * A token naming a key the cache lacks may mean the issuer rotated, so one fetch is allowed for it
 * per minute; past that the answer is "unknown" without a request.
 */
export class MojangKeys implements LoginKeySource {
    private readonly keys: ReturnType<typeof createRemoteJWKSet>;

    /** @param fetchKeys - How the key set is fetched; the global `fetch` by default. */
    public constructor(fetchKeys?: FetchImplementation) {
        this.keys = createRemoteJWKSet(KEYS_URL, {
            cacheMaxAge: KEY_LIFETIME_MS,
            cooldownDuration: REFETCH_INTERVAL_MS,
            timeoutDuration: FETCH_TIMEOUT_MS,
            ...(fetchKeys === undefined ? {} : { [customFetch]: fetchKeys })
        });
    }

    /** The published key for a token's `kid`, fetching the set when it is stale or the id is new. */
    public async keyFor(kid: string): Promise<VerificationKey | undefined> {
        try {
            return await this.keys({ alg: 'RS256', kid });
        } catch (error: unknown) {
            if (error instanceof errors.JWKSNoMatchingKey) return undefined;
            throw error;
        }
    }
}

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

/** Why `jose` refused a token, as a refusal: the message for the player and the detail for the log. */
const refusalOf = (error: unknown, what: string): LoginRefused => {
    if (error instanceof LoginRefused) return error;
    if (error instanceof errors.JWTExpired) return new LoginRefused('Your login has expired.', `${what} has expired`);
    if (error instanceof errors.JWTClaimValidationFailed) {
        const detail =
            error.claim === 'nbf'
                ? `${what} is not valid yet`
                : `${what} has the wrong ${error.claim}: ${error.reason}`;
        return new LoginRefused('Invalid login!', error.claim === 'iss' ? `${what} names another issuer` : detail);
    }
    if (error instanceof errors.JOSEAlgNotAllowed)
        return new LoginRefused('Invalid login!', `${what} uses a refused algorithm`);
    if (error instanceof errors.JWSSignatureVerificationFailed) {
        return new LoginRefused('Invalid login!', `${what} signature does not match`);
    }
    return new LoginRefused(
        'Invalid login!',
        `${what} is not a valid JWS: ${error instanceof Error ? error.message : String(error)}`
    );
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
 * `jose` checks both signatures and the token's `iss`, `exp` and `nbf`. The algorithms are fixed
 * here, never read from a token, or a token could choose its own check ("none", or a MAC keyed
 * with the public key).
 *
 * Fails closed. A missing token, an unknown key, an expired or foreign token, a bad signature and
 * an issuer that cannot be reached each refuse the login.
 * @param login - The login's two JWT blobs; a decoded `Login` packet has both.
 * @param keys - Where to find the issuer's public keys.
 * @param now - The current time in milliseconds, for expiry.
 * @throws {LoginRefused} when the login cannot be attributed to an account.
 */
export const verifyLogin = async (
    login: LoginCredentials,
    keys: LoginKeySource = loginKeys(),
    now: number = Date.now()
): Promise<VerifiedLogin> => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(login.chainData);
    } catch {
        parsed = undefined;
    }
    if (!isRecord(parsed)) throw new LoginRefused('Invalid login!', 'the connection request is not a JSON object');
    const request = parsed;

    if (request.AuthenticationType !== AuthenticationType.Full) {
        throw new LoginRefused(
            'Please sign in to Xbox Live to join.',
            `authentication type ${String(request.AuthenticationType)}`
        );
    }
    const token = textClaim(request, 'Token');
    if (token === undefined) throw new LoginRefused('Please sign in to Xbox Live to join.', 'no token');

    let claims: JWTPayload;
    try {
        ({ payload: claims } = await jwtVerify(
            token,
            async ({ kid }) => {
                if (kid === undefined) throw new LoginRefused('Invalid login!', 'the token names no key');
                let key: VerificationKey | undefined;
                try {
                    key = await keys.keyFor(kid);
                } catch (error: unknown) {
                    throw new LoginRefused(
                        'Could not verify your account right now. Please try again.',
                        `the issuer's keys could not be fetched: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
                if (key === undefined) throw new LoginRefused('Invalid login!', `unknown token key ${kid}`);
                return key;
            },
            {
                algorithms: ['RS256'],
                issuer: TOKEN_ISSUER,
                requiredClaims: ['exp'],
                clockTolerance: CLOCK_SKEW_SECONDS,
                currentDate: new Date(now)
            }
        ));
    } catch (error: unknown) {
        throw refusalOf(error, 'the token');
    }

    const xuid = textClaim(claims, 'xid');
    const displayName = textClaim(claims, 'xname');
    const identityPublicKey = textClaim(claims, 'cpk');
    if (xuid === undefined || displayName === undefined || identityPublicKey === undefined) {
        throw new LoginRefused('Invalid login!', 'the token lacks an account or a client key');
    }

    await verifyClientData(login.clientData, identityPublicKey);

    return { xuid, displayName, identity: textClaim(claims, 'leguuid'), identityPublicKey };
};

/** The client data must be signed by the key the token vouches for. */
const verifyClientData = async (clientData: string, identityPublicKey: string): Promise<void> => {
    let key: KeyObject;
    try {
        key = createPublicKey({ key: Buffer.from(identityPublicKey, 'base64'), format: 'der', type: 'spki' });
    } catch {
        throw new LoginRefused('Invalid login!', 'the token names an unusable client key');
    }

    try {
        await compactVerify(clientData, key, { algorithms: ['ES384'] });
    } catch (error: unknown) {
        if (error instanceof errors.JWSSignatureVerificationFailed) {
            throw new LoginRefused('Invalid login!', 'the client data is not signed by the account key');
        }
        throw refusalOf(error, 'the client data');
    }
};
