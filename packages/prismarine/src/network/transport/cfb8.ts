/**
 * AES in CFB8 mode, the stream cipher Java Edition encrypts a connection with once its login has
 * agreed on a secret.
 *
 * The AES itself is always the runtime's; only CFB8's byte feedback is written here. No maintained
 * package offers CFB8: `jose` covers the JOSE algorithms only, and `@noble/ciphers` and
 * `node-forge` have CFB with whole-block segments alone. `aes-js`, which `minecraft-protocol`
 * falls back to, has had no release since 2018.
 */
import type { Cipheriv } from 'node:crypto';
import { createCipheriv, createDecipheriv } from 'node:crypto';

/** One direction of an encrypted stream: bytes in, the same number of bytes out, in order. */
export interface StreamCipher {
    update(data: Buffer): Buffer;
}

/** CFB8 feeds back one byte at a time through a register one AES block wide. */
const BLOCK = 16;

/**
 * CFB8 built from AES-ECB, for a runtime without `aes-128-cfb8`, such as Bun. Each output byte is
 * the input byte XORed with the first byte of the AES encryption of the register, which then
 * shifts in the ciphertext byte. Decryption knows every ciphertext byte up front, so it encrypts
 * one register per byte in a single call; encryption learns each ciphertext byte only as it makes
 * it, so it encrypts one register at a time.
 * @param direction - Which way the stream goes.
 * @param key - The AES-128 key.
 * @param iv - The sixteen-byte initial register.
 * @returns The cipher.
 */
export const cfb8ViaEcb = (direction: 'encrypt' | 'decrypt', key: Buffer, iv: Buffer): StreamCipher => {
    const ecb: Cipheriv = createCipheriv('aes-128-ecb', key, null);
    ecb.setAutoPadding(false);
    let register = Buffer.from(iv);
    if (direction === 'decrypt') {
        return {
            update: (data) => {
                const history = Buffer.concat([register, data]);
                const registers = Buffer.allocUnsafe(data.byteLength * BLOCK);
                for (let i = 0; i < data.byteLength; i++) history.copy(registers, i * BLOCK, i, i + BLOCK);
                const keystream = ecb.update(registers);
                const out = Buffer.allocUnsafe(data.byteLength);
                for (let i = 0; i < data.byteLength; i++) out[i] = data[i]! ^ keystream[i * BLOCK]!;
                register = history.subarray(history.byteLength - BLOCK);
                return out;
            }
        };
    }
    return {
        update: (data) => {
            const out = Buffer.allocUnsafe(data.byteLength);
            for (let i = 0; i < data.byteLength; i++) {
                const byte = data[i]! ^ ecb.update(register)[0]!;
                out[i] = byte;
                register.copyWithin(0, 1);
                register[BLOCK - 1] = byte;
            }
            return out;
        }
    };
};

/**
 * AES-128 in CFB8 mode: the runtime's own when it has one, as Node does, else {@link cfb8ViaEcb}.
 * @param direction - Which way the stream goes.
 * @param key - The AES-128 key.
 * @param iv - The sixteen-byte initial register.
 * @returns The cipher.
 */
export const createCfb8 = (direction: 'encrypt' | 'decrypt', key: Buffer, iv: Buffer): StreamCipher => {
    try {
        return direction === 'encrypt'
            ? createCipheriv('aes-128-cfb8', key, iv)
            : createDecipheriv('aes-128-cfb8', key, iv);
    } catch {
        // Bun has no CFB8 and throws "Unknown cipher"; it has ECB, which CFB8 is built from.
        return cfb8ViaEcb(direction, key, iv);
    }
};
