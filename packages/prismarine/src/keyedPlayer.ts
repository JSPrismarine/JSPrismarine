/**
 * How a per-player service names the player whose state it holds.
 *
 * Advancement progress and the enchantment seed are filed under the player's key
 * (`playerKeyOf` in `playerIdentity.ts`), so a service needs the key and, when it reads the content or draws from
 * the server's random, the server. A session holds the identity the key comes from. A legacy
 * `Player` answers both through its accessors, so each service takes either one until every
 * caller holds the key.
 */
import type Server from './Server';
import { keyOfPlayer } from './playerIdentity';

/** A player as a keyed service reads it. */
export interface KeyedPlayer {
    /** The key the player's state is filed under: `playerKeyOf` of its identity. */
    readonly key: string;
    /** The server whose content and random the service reads. */
    readonly server: Server;
}

/** A legacy player, which answers for its key and its server through accessors. */
type LegacyKeyedPlayer = Parameters<typeof keyOfPlayer>[0] & { getServer(): Server };

/** What a service that needs only the key accepts: the key, a {@link KeyedPlayer} or a legacy player. */
export type PlayerKeySource = string | KeyedPlayer | Parameters<typeof keyOfPlayer>[0];

/** What a service that also reads the server accepts. */
export type KeyedPlayerSource = KeyedPlayer | LegacyKeyedPlayer;

/**
 * The key a source names.
 * @param source - The key itself, a {@link KeyedPlayer} or a legacy player.
 * @returns The key the player's state is filed under.
 */
export const playerKeyFrom = (source: PlayerKeySource): string => {
    if (typeof source === 'string') return source;
    return 'key' in source ? source.key : keyOfPlayer(source);
};

/**
 * A source as a {@link KeyedPlayer}.
 * @param source - A {@link KeyedPlayer}, returned as it is, or a legacy player.
 * @returns The key and the server.
 */
export const keyedPlayerOf = (source: KeyedPlayerSource): KeyedPlayer =>
    'key' in source ? source : { key: keyOfPlayer(source), server: source.getServer() };
