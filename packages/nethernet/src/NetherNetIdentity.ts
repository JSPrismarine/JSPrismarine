import fs from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { compactVerify, decodeJwt } from 'jose';
import { BEDROCK_CURVE, compactEs384, detachedEs384, verifiesDetachedEs384 } from './es384';
import { isRecord } from './isRecord';
import { sdpFingerprints, withoutIdentity, withSessionAttribute } from './sdp';
import type { SdpFingerprint } from './sdp';

/** How long a signed identity token is valid; go-nethernet and Bedrock Dedicated Server use a minute. */
const TOKEN_LIFETIME_SECONDS = 60;

/**
 * The fingerprints as canonical JSON: keys in code point order, no whitespace. The client
 * rebuilds these exact bytes from the answer's `a=fingerprint` lines to check the signature.
 * @param fingerprints - The answer's fingerprints, in SDP order.
 */
export const canonicalFingerprints = (fingerprints: readonly SdpFingerprint[]): string =>
    JSON.stringify({
        fingerprint: fingerprints.map(({ algorithm, digest }) => ({ algorithm, digest }))
    });

/** How an identity writes its public key into the token's `cpk` claim. */
export type IdentityKeyFormat =
    /** A JSON Web Key, as servers since 26.40 write it. */
    | 'jwk'
    /** Base64 DER, as clients write it, the form the Login packet's keys take. */
    | 'der';

/** How a {@link NetherNetIdentity} presents itself. */
export interface NetherNetIdentityOptions {
    /** Shown to players on first use over plain HTTP. Bedrock Dedicated Server says `self`. */
    readonly domain?: string;
    /** How the token carries the public key; a server's is a JWK, a client's base64 DER. */
    readonly keyFormat?: IdentityKeyFormat;
    /** The clock, in milliseconds since the epoch. */
    readonly now?: () => number;
    /**
     * A token an authority issued for this key, used instead of a self-signed one: a signed-in
     * client's multiplayer token from Minecraft's authorization service, whose `cpk` claim names
     * this key. The fingerprints are still signed with the key here.
     */
    readonly token?: string;
}

/**
 * A NetherNet identity: a P-384 key whose public half a session description carries, signed, in
 * `a=identity`. A client refuses an answer without one, and Bedrock Dedicated Server refuses an
 * offer without one.
 *
 * A server's key must survive restarts: over plain HTTP the client remembers it the first time
 * and asks the player about any other. {@link NetherNetIdentity.loadOrCreate} keeps it in a file.
 */
export class NetherNetIdentity {
    private readonly x5u: string;
    private readonly cpk: string | object;
    private readonly domain: string;
    private readonly now: () => number;
    private readonly issuedToken: string | undefined;

    /**
     * @param privateKey - A P-384 private key.
     * @param options - How the identity presents itself; a server's by default.
     */
    public constructor(
        private readonly privateKey: KeyObject,
        options: NetherNetIdentityOptions = {}
    ) {
        const publicKey = createPublicKey(privateKey);
        if (publicKey.asymmetricKeyDetails?.namedCurve !== BEDROCK_CURVE) {
            throw new Error(`A NetherNet identity key must be ${BEDROCK_CURVE}`);
        }
        this.x5u = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        this.cpk = (options.keyFormat ?? 'jwk') === 'jwk' ? publicKey.export({ format: 'jwk' }) : this.x5u;
        this.domain = options.domain ?? 'self';
        this.now = options.now ?? Date.now;
        this.issuedToken = options.token;
    }

    /**
     * A fresh client identity, for one connection.
     * @param domain - The identity provider's domain, as the client names it.
     */
    public static client(domain = 'self'): NetherNetIdentity {
        const { privateKey } = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });
        return new NetherNetIdentity(privateKey, { domain, keyFormat: 'der' });
    }

    /**
     * Reads the key from `file`, or makes one and writes it there, readable by its owner only.
     * @param file - Where the PKCS #8 PEM key lives.
     */
    public static loadOrCreate(file: string): NetherNetIdentity {
        if (fs.existsSync(file)) return new NetherNetIdentity(createPrivateKey(fs.readFileSync(file)));

        const { privateKey } = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });
        fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
        return new NetherNetIdentity(privateKey);
    }

    /**
     * The description with `a=identity` added: a self-signed token carrying the public key as
     * `cpk`, and a detached signature over the description's DTLS fingerprints, which binds the key
     * to the certificate WebRTC will present.
     * @param description - The SDP offer or answer, with its `a=fingerprint` lines.
     * @throws {Error} When the description has no fingerprint to sign.
     */
    public async sign(description: string): Promise<string> {
        const fingerprints = sdpFingerprints(description);
        if (fingerprints.length === 0) throw new Error('An SDP description without a fingerprint cannot be signed');

        const issuedAt = Math.floor(this.now() / 1000);
        const token =
            this.issuedToken ??
            (await compactEs384(
                { x5u: this.x5u },
                { exp: issuedAt + TOKEN_LIFETIME_SECONDS, iat: issuedAt, cpk: this.cpk },
                this.privateKey
            ));
        const identity = {
            // The assertion is JSON inside a JSON string, as NetherNet nests it.
            assertion: JSON.stringify({
                fingerprints: await detachedEs384(canonicalFingerprints(fingerprints), this.privateKey),
                token
            }),
            idp: { domain: this.domain, protocol: 'default' }
        };
        return withSessionAttribute(
            description,
            `a=identity:${Buffer.from(JSON.stringify(identity)).toString('base64')}`
        );
    }
}

/** What {@link verifySelfSignedIdentity} found in a description it accepted. */
export interface VerifiedIdentity {
    /** The identity's public key, from the token's `cpk` claim. */
    readonly publicKey: KeyObject;
    /** The domain the identity names, which a player may be shown. */
    readonly domain: string;
    /** The description without `a=identity`, ready for WebRTC. */
    readonly description: string;
}

/** The `cpk` claim as a public key: a JWK, or base64 DER. */
const claimedKey = (cpk: unknown): KeyObject => {
    if (typeof cpk === 'string')
        return createPublicKey({ key: Buffer.from(cpk, 'base64'), format: 'der', type: 'spki' });
    if (isRecord(cpk)) {
        const { kty, crv, x, y } = cpk;
        if (typeof kty === 'string' && typeof crv === 'string' && typeof x === 'string' && typeof y === 'string') {
            return createPublicKey({ key: { kty, crv, x, y }, format: 'jwk' });
        }
    }
    throw new Error('The identity token has no usable cpk claim');
};

/**
 * Checks a self-signed `a=identity` the way a NetherNet client checks a server's: the token is
 * signed by the key in its own `cpk` claim and not expired, and the detached signature covers this
 * description's fingerprints. Offline clients sign their offers the same way; an online client's
 * token is signed by the authorization service instead, which this does not check.
 * @param description - The SDP description carrying `a=identity`.
 * @param nowMs - The clock, in milliseconds since the epoch.
 * @throws {Error} When the identity is missing, malformed, expired or does not verify.
 */
export const verifySelfSignedIdentity = async (description: string, nowMs = Date.now()): Promise<VerifiedIdentity> => {
    const line = description.split(/\r?\n/).find((candidate) => candidate.startsWith('a=identity:'));
    if (line === undefined) throw new Error('The description carries no a=identity');

    const identity: unknown = JSON.parse(Buffer.from(line.slice('a=identity:'.length), 'base64').toString());
    if (!isRecord(identity) || typeof identity.assertion !== 'string' || !isRecord(identity.idp)) {
        throw new Error('The a=identity has no assertion');
    }
    const assertion: unknown = JSON.parse(identity.assertion);
    if (!isRecord(assertion) || typeof assertion.token !== 'string' || typeof assertion.fingerprints !== 'string') {
        throw new Error('The identity assertion is malformed');
    }

    // The key to check the token with is the one the token names, so it is read unchecked first.
    let claims: Record<string, unknown>;
    try {
        claims = decodeJwt(assertion.token);
    } catch {
        throw new Error('The identity token has no claims');
    }
    const publicKey = claimedKey(claims.cpk);
    try {
        await compactVerify(assertion.token, publicKey, { algorithms: ['ES384'] });
    } catch {
        throw new Error('The identity token is not signed by its own key');
    }
    if (typeof claims.exp === 'number' && claims.exp < nowMs / 1000) throw new Error('The identity token has expired');

    const fingerprints = canonicalFingerprints(sdpFingerprints(description));
    if (!(await verifiesDetachedEs384(assertion.fingerprints, fingerprints, publicKey))) {
        throw new Error("The identity does not sign this description's fingerprints");
    }

    return {
        publicKey,
        domain: typeof identity.idp.domain === 'string' ? identity.idp.domain : '',
        description: withoutIdentity(description)
    };
};
