import type { KeyObject } from 'node:crypto';

import { CompactSign, FlattenedSign, flattenedVerify } from 'jose';

/** The curve Bedrock signs with: the login chain, the encryption handshake and NetherNet identities. */
export const BEDROCK_CURVE = 'secp384r1';

const ES384 = 'ES384';
const encoder = new TextEncoder();

/**
 * A compact ES384 JWS (a JWT, when the payload is a claim set): `header.payload.signature`,
 * signed by `jose`.
 * @param header - Header fields besides `alg`, such as `x5u`.
 * @param payload - The JSON payload.
 * @param privateKey - A P-384 private key.
 */
export const compactEs384 = (
    header: Readonly<Record<string, unknown>>,
    payload: unknown,
    privateKey: KeyObject
): Promise<string> =>
    new CompactSign(encoder.encode(JSON.stringify(payload)))
        .setProtectedHeader({ alg: ES384, ...header })
        .sign(privateKey);

/**
 * A detached ES384 JWS over exact payload bytes (RFC 7515 appendix F): `header..signature`. The
 * verifier rebuilds the payload itself, so its bytes must be the canonical ones it will build.
 * @param payload - The payload bytes, signed as given.
 * @param privateKey - A P-384 private key.
 */
export const detachedEs384 = async (payload: string, privateKey: KeyObject): Promise<string> => {
    const signed = await new FlattenedSign(encoder.encode(payload)).setProtectedHeader({ alg: ES384 }).sign(privateKey);
    return `${signed.protected ?? ''}..${signed.signature}`;
};

/**
 * Whether `jws` is a detached ES384 signature over `payload` by `publicKey`.
 * @param jws - The detached JWS, `header..signature`.
 * @param payload - The payload bytes the signer should have signed.
 * @param publicKey - The P-384 key it should verify against.
 */
export const verifiesDetachedEs384 = async (jws: string, payload: string, publicKey: KeyObject): Promise<boolean> => {
    const [header, detached, signature, ...extra] = jws.split('.');
    if (header === undefined || detached !== '' || signature === undefined || extra.length > 0) return false;
    try {
        await flattenedVerify(
            { protected: header, payload: Buffer.from(payload).toString('base64url'), signature },
            publicKey,
            { algorithms: [ES384] }
        );
        return true;
    } catch {
        return false;
    }
};
