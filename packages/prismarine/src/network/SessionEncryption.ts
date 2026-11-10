import { createHash, createPublicKey, diffieHellman, generateKeyPairSync, randomBytes } from 'node:crypto';

import { EncryptionCodec } from '@jsprismarine/protocol';
import { BEDROCK_CURVE, compactEs384 } from '@jsprismarine/nethernet';

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
    private readonly keys = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });
    private readonly x5u = this.keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

    /**
     * @param clientPublicKey - The client's identity key, base64 DER, as its login names it.
     * @throws when the key is not a P-384 public key.
     */
    public async begin(clientPublicKey: string): Promise<SessionEncryptionHandshake> {
        const peer = createPublicKey({ key: Buffer.from(clientPublicKey, 'base64'), format: 'der', type: 'spki' });
        if (peer.asymmetricKeyType !== 'ec' || peer.asymmetricKeyDetails?.namedCurve !== BEDROCK_CURVE) {
            throw new Error(`The client identity key is not a ${BEDROCK_CURVE} public key`);
        }

        const salt = randomBytes(SALT_BYTES);
        const secret = diffieHellman({ privateKey: this.keys.privateKey, publicKey: peer });
        const key = createHash('sha256').update(salt).update(secret).digest();

        const jwt = await compactEs384({ x5u: this.x5u }, { salt: salt.toString('base64') }, this.keys.privateKey);
        return { jwt, codec: new EncryptionCodec(key) };
    }
}

let shared: SessionEncryption | undefined;

/** The process-wide handshake key, generated on first use so a server that never logs anyone in pays nothing. */
export const sessionEncryption = (): SessionEncryption => (shared ??= new SessionEncryption());

export default SessionEncryption;
