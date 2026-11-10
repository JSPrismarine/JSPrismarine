import { sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

/** The curve Bedrock signs with: the login chain, the encryption handshake and NetherNet identities. */
export const BEDROCK_CURVE = 'secp384r1';

/** A JSON value's bytes in base64url, the encoding every JWS part uses. */
const base64UrlJson = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Signs `header.payload` with ES384, the signature as JWS writes it: `r || s`, 48 bytes each,
 * rather than the DER Node produces by default.
 * @param header - The JWS protected header; `alg` is set to `ES384` in front of the rest.
 * @param payload - The payload, already base64url-encoded.
 * @param privateKey - A P-384 private key.
 * @returns The encoded header and the encoded signature.
 */
const signEs384 = (
    header: Readonly<Record<string, unknown>>,
    payload: string,
    privateKey: KeyObject
): { header: string; signature: string } => {
    const encodedHeader = base64UrlJson({ alg: 'ES384', ...header });
    const signature = sign('sha384', Buffer.from(`${encodedHeader}.${payload}`), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363'
    });
    return { header: encodedHeader, signature: signature.toString('base64url') };
};

/**
 * A compact ES384 JWS (a JWT, when the payload is a claim set): `header.payload.signature`.
 * @param header - Header fields besides `alg`, such as `x5u`.
 * @param payload - The JSON payload.
 * @param privateKey - A P-384 private key.
 */
export const compactEs384 = (
    header: Readonly<Record<string, unknown>>,
    payload: unknown,
    privateKey: KeyObject
): string => {
    const encodedPayload = base64UrlJson(payload);
    const signed = signEs384(header, encodedPayload, privateKey);
    return `${signed.header}.${encodedPayload}.${signed.signature}`;
};

/**
 * A detached ES384 JWS over exact payload bytes (RFC 7515 appendix F): `header..signature`. The
 * verifier rebuilds the payload itself, so its bytes must be the canonical ones it will build.
 * @param payload - The payload bytes, signed as given.
 * @param privateKey - A P-384 private key.
 */
export const detachedEs384 = (payload: string, privateKey: KeyObject): string => {
    const signed = signEs384({}, Buffer.from(payload).toString('base64url'), privateKey);
    return `${signed.header}..${signed.signature}`;
};
