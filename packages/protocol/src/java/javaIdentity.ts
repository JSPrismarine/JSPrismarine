/**
 * The identities both ends of a Java Edition login derive: the UUID an offline-mode server gives a
 * name, and the server hash a client and a server each send Mojang's session server.
 */
import { createHash } from 'node:crypto';

import { hyphenatedUuid } from './wire/javaTypes';

/**
 * The UUID an offline-mode server gives a name: version 3, from the MD5 of `OfflinePlayer:<name>`,
 * as the vanilla server derives it.
 * @param name - The player's name.
 * @returns The hyphenated UUID.
 */
export const offlineUuid = (name: string): string => {
    const bytes = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
    bytes[6] = (bytes[6]! & 0x0f) | 0x30;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    return hyphenatedUuid(bytes.toString('hex'));
};

/**
 * The server hash: the SHA-1 of the server id, the shared secret and the server's public key, as
 * a signed big-endian number in hexadecimal without leading zeros, `-` in front when negative.
 * @param serverId - The id the encryption request sent, empty for every modern server.
 * @param sharedSecret - The secret the client chose.
 * @param publicKey - The server's public key, as DER.
 * @returns The hash.
 */
export const serverHash = (serverId: string, sharedSecret: Buffer, publicKey: Buffer): string => {
    const digest = createHash('sha1').update(serverId, 'latin1').update(sharedSecret).update(publicKey).digest();
    const negative = (digest[0]! & 0x80) !== 0;
    if (negative) {
        // Two's complement: invert every byte, then add one.
        let carry = 1;
        for (let i = digest.byteLength - 1; i >= 0; i--) {
            const value = (~digest[i]! & 0xff) + carry;
            digest[i] = value & 0xff;
            carry = value >> 8;
        }
    }
    const hex = digest.toString('hex').replace(/^0+/, '');
    return negative ? `-${hex}` : hex;
};
