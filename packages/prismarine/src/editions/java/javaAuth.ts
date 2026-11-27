/**
 * What a Java Edition login proves about a player: the shared secret the client sent, and Mojang's
 * session server's answer to the hash `@jsprismarine/protocol/java/javaIdentity` computes.
 */
import { constants, privateDecrypt, randomBytes } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

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
 * Decrypts what a Java client encrypted with the server's public key, as RSA with PKCS #1 v1.5
 * padding, the only padding the client uses.
 *
 * Bun refuses `RSA_PKCS1_PADDING` for private decryption, so this decrypts the raw block and takes
 * the padding off itself. A block that is not `00 02`, at least eight nonzero padding bytes, `00`
 * and a message of `length` bytes gives random bytes instead of an error, as OpenSSL's implicit
 * rejection does: a client that sent garbage then fails the verify token or the encryption, and
 * nobody learns which blocks had good padding. The check reads every byte whatever it finds.
 * @param key - The server's private key.
 * @param ciphertext - What the client sent.
 * @param length - How many bytes the message is: 16 for the shared secret, the verify token's own.
 * @returns The message, or random bytes of the same length.
 */
export const decryptFromClient = (key: KeyObject, ciphertext: Buffer, length: number): Buffer => {
    const rejected = randomBytes(length);
    let block: Buffer;
    try {
        block = privateDecrypt({ key, padding: constants.RSA_NO_PADDING }, ciphertext);
    } catch {
        // Not a block this key encrypts, such as one of the wrong size.
        return rejected;
    }
    const separator = block.byteLength - length - 1;
    if (separator < 10) return rejected;
    let bad = block[0]! | (block[1]! ^ 0x02) | block[separator]!;
    for (let i = 2; i < separator; i++) bad |= block[i]! === 0 ? 1 : 0;
    return bad === 0 ? block.subarray(separator + 1) : rejected;
};

/** Where `hasJoined` asks. */
export const SESSION_SERVER = 'https://sessionserver.mojang.com/session/minecraft/hasJoined';

/**
 * Asks Mojang's session server whether the player told it they are joining this server.
 * @param name - The name the client logged in with.
 * @param hash - The server hash, as `serverHash` in `@jsprismarine/protocol/java/javaIdentity` computes it.
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
