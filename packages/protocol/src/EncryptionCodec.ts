import { createCipheriv, createHash } from 'node:crypto';

import type { Cipheriv } from 'node:crypto';

/** How many bytes of the SHA-256 travel as the checksum. */
const CHECKSUM_LENGTH = 8;

/**
 * The cipher both ends agree on, and the initialisation vector built from the key itself.
 *
 * Not a random IV, and not the key's first sixteen bytes either: twelve bytes of key followed
 * by a counter block of `00 00 00 02`. There is nothing to derive it from - it is simply the
 * construction the game uses, and a peer that picks any other one produces a stream that
 * decrypts to noise without either side being told why.
 */
const CIPHER = 'aes-256-ctr';
const IV_KEY_BYTES = 12;
const IV_SUFFIX = Buffer.from([0, 0, 0, 2]);

const streamFor = (key: Buffer): Cipheriv =>
    createCipheriv(CIPHER, key, Buffer.concat([key.subarray(0, IV_KEY_BYTES), IV_SUFFIX]));

/**
 * The encryption layer, which sits between a batch and the transport.
 *
 * A batch arrives here already framed and compressed - `0xFE`, the algorithm byte, the
 * compressed packets - and everything after the `0xFE` is encrypted. The header stays in the
 * clear because RakNet has to keep recognising the frame, and because the checksum is computed
 * over what follows it rather than over the whole thing.
 *
 * Two things make this unforgiving. The stream is *continuous*: one keystream runs across
 * every batch in a direction, so a batch that is dropped, reordered or encrypted twice
 * desynchronises everything after it and there is no resynchronising. And each direction keeps
 * its own counter, which is hashed into the checksum but never sent - so the only way a peer
 * learns the counters disagree is that every checksum from then on is wrong.
 *
 * Both of those fail the same way a wrong key does: silently, with the connection simply
 * stopping. Hence {@link decrypt} refusing a bad checksum loudly rather than passing on a
 * batch that decrypted to something.
 */
export class EncryptionCodec {
    private sendCounter = 0n;
    private receiveCounter = 0n;

    private readonly sendStream: Cipheriv;
    private readonly receiveStream: Cipheriv;

    /**
     * @param key - the 32 bytes both ends derived from the shared secret and the salt.
     */
    public constructor(private readonly key: Buffer) {
        if (key.byteLength !== 32) {
            throw new Error(`An encryption key is 32 bytes, got ${key.byteLength}`);
        }

        // Counter mode, so encrypting and decrypting are the same operation and one direction
        // needs one object. They are kept rather than made per batch: the keystream continues
        // where the last batch left it.
        this.sendStream = streamFor(key);
        this.receiveStream = streamFor(key);
    }

    /** A framed batch, encrypted and carrying its checksum. */
    public encrypt(batch: Buffer): Buffer {
        const header = batch.subarray(0, 1);
        const body = batch.subarray(1);
        const checksum = this.checksum(this.sendCounter++, body);

        return Buffer.concat([header, this.sendStream.update(Buffer.concat([body, checksum]))]);
    }

    /**
     * The reverse, with the checksum verified and removed.
     * @throws when the checksum disagrees, which means the key, the order or the counters do.
     */
    public decrypt(batch: Buffer): Buffer {
        const header = batch.subarray(0, 1);
        const body = this.receiveStream.update(batch.subarray(1));

        if (body.byteLength < CHECKSUM_LENGTH) {
            throw new Error(`An encrypted batch is at least ${CHECKSUM_LENGTH} bytes, got ${body.byteLength}`);
        }

        const payload = body.subarray(0, body.byteLength - CHECKSUM_LENGTH);
        const carried = body.subarray(body.byteLength - CHECKSUM_LENGTH);
        const expected = this.checksum(this.receiveCounter++, payload);

        if (!carried.equals(expected)) {
            throw new Error(
                `Checksum mismatch on batch ${this.receiveCounter - 1n}: expected ${expected.toString('hex')}, got ${carried.toString('hex')}`
            );
        }

        return Buffer.concat([header, payload]);
    }

    /** The counter, the payload and the key, hashed together and cut to eight bytes. */
    private checksum(counter: bigint, payload: Buffer): Buffer {
        const counted = Buffer.alloc(8);
        counted.writeBigUInt64LE(counter);

        return createHash('sha256')
            .update(counted)
            .update(payload)
            .update(this.key)
            .digest()
            .subarray(0, CHECKSUM_LENGTH);
    }
}

export default EncryptionCodec;
