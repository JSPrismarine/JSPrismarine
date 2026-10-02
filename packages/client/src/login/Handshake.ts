import { createHash, createPrivateKey, createPublicKey, diffieHellman } from 'node:crypto';

/**
 * The key both ends of a connection arrive at without either sending it.
 *
 * The server picks a salt and sends it, with its public key, in the one JWT of
 * `ServerToClientHandshake`. Each side then does the same ECDH against the other's public key,
 * arrives at the same shared secret, and hashes the salt together with it. Nothing secret
 * crosses the wire, and a client that gets any step wrong produces a key that is simply
 * different - there is no negotiation and no error, only a connection that stops.
 */

/** The header field carrying the sender's public key, as base64 DER rather than a JWK. */
interface JwtHeader {
    x5u?: string;
}

interface SaltClaims {
    salt?: string;
}

const decodeSegment = (segment: string): unknown => {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(json);
};

/**
 * The two halves of the handshake token.
 *
 * The signature is not checked. An offline client has nothing to check it against - the key
 * that signed it is the one carried in the token - so verifying would prove only that the
 * token is self-consistent, which it is by construction. What protects the exchange is that a
 * wrong key yields a wrong secret, which the very next batch fails its checksum on.
 */
export const readHandshake = (jwt: string): { publicKeyDer: string; salt: Buffer } => {
    const [rawHeader, rawPayload] = jwt.split('.');
    if (rawHeader === undefined || rawPayload === undefined) {
        throw new Error('A handshake token has a header and a payload separated by dots');
    }

    const { x5u } = decodeSegment(rawHeader) as JwtHeader;
    if (x5u === undefined) throw new Error('The handshake token carries no `x5u` public key');

    const { salt } = decodeSegment(rawPayload) as SaltClaims;
    if (salt === undefined) throw new Error('The handshake token carries no `salt`');

    // Base64 without padding is what the claim carries; Node wants either, but only if it is
    // told which, and `base64` rejects nothing so the unpadded form decodes cleanly.
    return { publicKeyDer: x5u, salt: Buffer.from(salt, 'base64') };
};

/**
 * The 32 byte key, from our private key and what the server sent.
 * @param privateKeyPem - the identity key, in the PKCS#8 PEM the auth provider hands out.
 * @param publicKeyDer - the server's public key, base64 DER, straight from the `x5u` header.
 * @param salt - the salt the server chose.
 */
export const deriveEncryptionKey = (privateKeyPem: string, publicKeyDer: string, salt: Buffer): Buffer => {
    const privateKey = createPrivateKey(privateKeyPem);
    const publicKey = createPublicKey({
        key: Buffer.from(publicKeyDer, 'base64'),
        format: 'der',
        type: 'spki'
    });

    const secret = diffieHellman({ privateKey, publicKey });

    return createHash('sha256').update(salt).update(secret).digest();
};
