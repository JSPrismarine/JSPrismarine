import fs from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import { BEDROCK_CURVE, compactEs384, detachedEs384 } from '../es384';
import { sdpFingerprints, withSessionAttribute } from './sdp';
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

/**
 * The server's NetherNet identity: a long-lived P-384 key whose public half every SDP answer
 * carries, signed, in `a=identity`. A client refuses an answer without one. Over plain HTTP the
 * client remembers the key the first time and asks the player about any other, so the key must
 * survive restarts: {@link NetherNetIdentity.loadOrCreate} keeps it in a file.
 */
export class NetherNetIdentity {
    private readonly x5u: string;
    private readonly jwk: object;

    /**
     * @param privateKey - A P-384 private key.
     * @param domain - Shown to players on first use over plain HTTP. Bedrock Dedicated Server says `self`.
     * @param now - The clock, in milliseconds since the epoch.
     */
    public constructor(
        private readonly privateKey: KeyObject,
        private readonly domain = 'self',
        private readonly now: () => number = Date.now
    ) {
        const publicKey = createPublicKey(privateKey);
        if (publicKey.asymmetricKeyDetails?.namedCurve !== BEDROCK_CURVE) {
            throw new Error(`A NetherNet identity key must be ${BEDROCK_CURVE}`);
        }
        this.x5u = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        this.jwk = publicKey.export({ format: 'jwk' });
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
     * The answer with `a=identity` added: a self-signed token carrying the public key as `cpk`,
     * and a detached signature over the answer's DTLS fingerprints, which binds the key to the
     * certificate WebRTC will present.
     * @param answer - The SDP answer, with its `a=fingerprint` lines.
     * @throws {Error} When the answer has no fingerprint to sign.
     */
    public sign(answer: string): string {
        const fingerprints = sdpFingerprints(answer);
        if (fingerprints.length === 0) throw new Error('An SDP answer without a fingerprint cannot be signed');

        const issuedAt = Math.floor(this.now() / 1000);
        const token = compactEs384(
            { x5u: this.x5u },
            { exp: issuedAt + TOKEN_LIFETIME_SECONDS, iat: issuedAt, cpk: this.jwk },
            this.privateKey
        );
        const identity = {
            // The assertion is JSON inside a JSON string, as NetherNet nests it.
            assertion: JSON.stringify({
                fingerprints: detachedEs384(canonicalFingerprints(fingerprints), this.privateKey),
                token
            }),
            idp: { domain: this.domain, protocol: 'default' }
        };
        return withSessionAttribute(answer, `a=identity:${Buffer.from(JSON.stringify(identity)).toString('base64')}`);
    }
}
