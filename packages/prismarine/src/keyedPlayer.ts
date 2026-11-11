/**
 * How a per-player service names the player whose state it holds.
 *
 * Advancement progress and the enchantment seed are filed under the player's key
 * (`playerKeyOf` in `playerIdentity.ts`), so a service needs the key and, when it reads the content
 * or draws from the server's random, the server. A session holds the identity the key comes from
 * and answers both through `PlayerSession.keyed`.
 */
import type Server from './Server';

/** A player as a keyed service reads it. */
export interface KeyedPlayer {
    /** The key the player's state is filed under: `playerKeyOf` of its identity. */
    readonly key: string;
    /** The server whose content and random the service reads. */
    readonly server: Server;
}

/** What a service that needs only the key accepts: the key, or a {@link KeyedPlayer}. */
export type PlayerKeySource = string | KeyedPlayer;

/** A player that answers for its key and its server, as a session does. */
export interface KeyedPlayerHolder {
    keyed(): KeyedPlayer;
}

/**
 * The key a source names.
 * @param source - The key itself, or a {@link KeyedPlayer}.
 * @returns The key the player's state is filed under.
 */
export const playerKeyFrom = (source: PlayerKeySource): string => (typeof source === 'string' ? source : source.key);
