/**
 * What a Java Edition login proves about a player: the offline UUID a name gives, the hash a
 * client and the server both send Mojang's session server, and that server's answer.
 */
import { createHash } from 'node:crypto';

import { hyphenatedUuid } from '@jsprismarine/protocol/java/wire/javaTypes';

import { isRecord } from '../../utils/isRecord';

/** A game profile, as Mojang's session server and `Login Success` describe a player. */
export interface JavaProfile {
    /** The hyphenated UUID. */
    readonly id: string;
    readonly name: string;
    readonly properties: readonly {
        readonly name: string;
        readonly value: string;
        readonly signature: string | null;
    }[];
}

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

/** Where `hasJoined` asks. */
export const SESSION_SERVER = 'https://sessionserver.mojang.com/session/minecraft/hasJoined';

/**
 * Asks Mojang's session server whether the player told it they are joining this server.
 * @param name - The name the client logged in with.
 * @param hash - The {@link serverHash}.
 * @param fetchJson - How to make the request; the global `fetch` in production.
 * @returns The profile Mojang holds for the player, or undefined when it says the player did not join.
 */
export const hasJoined = async (
    name: string,
    hash: string,
    fetchJson: (url: string) => Promise<{ status: number; json(): Promise<unknown> }> = fetch
): Promise<JavaProfile | undefined> => {
    const url = `${SESSION_SERVER}?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(hash)}`;
    const response = await fetchJson(url);
    // 204: Mojang has no record of the join.
    if (response.status !== 200) return undefined;
    const body = await response.json();
    if (!isRecord(body)) return undefined;
    const { id, name: profileName, properties } = body;
    if (typeof id !== 'string' || typeof profileName !== 'string' || !/^[0-9a-f]{32}$/.test(id)) return undefined;
    return {
        id: hyphenatedUuid(id),
        name: profileName,
        properties: Array.isArray(properties)
            ? properties.flatMap((property: unknown) => {
                  if (!isRecord(property)) return [];
                  const { name: key, value, signature } = property;
                  if (typeof key !== 'string' || typeof value !== 'string') return [];
                  return [{ name: key, value, signature: typeof signature === 'string' ? signature : null }];
              })
            : []
    };
};
