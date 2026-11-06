import { createHash, createPublicKey, diffieHellman, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

import { EncryptionCodec } from '@jsprismarine/protocol';

/** The curve Bedrock uses for both the server's handshake key and the client's identity key. */
const CURVE = 'secp384r1';

/** Bytes of salt the server mixes into the key. */
const SALT_BYTES = 16;

/** The signed token that goes out in `ServerToClientHandshake`, and the codec both ends now share. */
export interface SessionEncryptionHandshake {
    /** The JWT for `ServerToClientHandshake`. */
    readonly jwt: string;
    /** The codec to install once the token has been framed; the client installs its own on receipt. */
    readonly codec: EncryptionCodec;
}

/**
 * Starts encrypted sessions: one P-384 key pair for the life of the server, a fresh salt per session.
 *
 * The key is derived the way the client derives it. ECDH between the server's private key and the
 * client's identity key, then SHA-256(salt || shared secret), is the AES key. The token carries the
 * server's public key as `x5u` and the salt as a claim, signed ES384, and nothing secret.
 */
export class SessionEncryption {
    private readonly keys = generateKeyPairSync('ec', { namedCurve: CURVE });
    private readonly x5u = this.keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

    /**
     * @param clientPublicKey - The client's identity key, base64 DER, as its login names it.
     * @throws when the key is not a P-384 public key.
     */
    public begin(clientPublicKey: string): SessionEncryptionHandshake {
        const peer = createPublicKey({ key: Buffer.from(clientPublicKey, 'base64'), format: 'der', type: 'spki' });
        if (peer.asymmetricKeyType !== 'ec' || peer.asymmetricKeyDetails?.namedCurve !== CURVE) {
            throw new Error(`The client identity key is not a ${CURVE} public key`);
        }

        const salt = randomBytes(SALT_BYTES);
        const secret = diffieHellman({ privateKey: this.keys.privateKey, publicKey: peer });
        const key = createHash('sha256').update(salt).update(secret).digest();

        const header = Buffer.from(JSON.stringify({ alg: 'ES384', x5u: this.x5u })).toString('base64url');
        const claims = Buffer.from(JSON.stringify({ salt: salt.toString('base64') })).toString('base64url');
        const signature = sign('sha384', Buffer.from(`${header}.${claims}`), {
            key: this.keys.privateKey,
            dsaEncoding: 'ieee-p1363'
        });

        return { jwt: `${header}.${claims}.${signature.toString('base64url')}`, codec: new EncryptionCodec(key) };
    }
}

let shared: SessionEncryption | undefined;

/** The process-wide handshake key, generated on first use so a server that never logs anyone in pays nothing. */
export const sessionEncryption = (): SessionEncryption => (shared ??= new SessionEncryption());

export default SessionEncryption;
