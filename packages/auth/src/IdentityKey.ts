import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';

/**
 * The curve Bedrock's identity keys use, and the JOSE algorithm that goes with it. Not
 * configurable: a server derives its encryption secret from this key, so both ends have to
 * agree, and the protocol fixes the answer.
 */
const CURVE = 'secp384r1';
const ALGORITHM = 'ES384';

/**
 * A client's identity key: the P-384 key a login's chain, token and client data name, and the
 * key the encryption handshake derives its secret from.
 *
 * Every token it signs names it in the `x5u` header, which is how a verifier finds the key to
 * check the signature with.
 */
export class IdentityKey {
    /** The public half, as a `KeyObject`. */
    public readonly publicKey: KeyObject;
    /** The public key, DER inside base64: the form `x5u`, `identityPublicKey` and `cpk` carry. */
    public readonly publicKeyDer: string;
    /** The private key as PEM-encoded PKCS#8. */
    public readonly privateKeyPem: string;

    /** @param privateKey - A P-384 private key. */
    public constructor(public readonly privateKey: KeyObject) {
        this.publicKey = createPublicKey(privateKey);
        this.publicKeyDer = this.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        this.privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    }

    /** A fresh key. */
    public static generate(): IdentityKey {
        return new IdentityKey(generateKeyPairSync('ec', { namedCurve: CURVE }).privateKey);
    }

    /**
     * Signs claims as an ES384 JWT whose header names this key. Only the claims given are
     * signed: nothing such as `iat` is added.
     * @param claims - The token's claims.
     */
    public sign(claims: Record<string, unknown>): Promise<string> {
        return new SignJWT(claims).setProtectedHeader({ alg: ALGORITHM, x5u: this.publicKeyDer }).sign(this.privateKey);
    }
}
