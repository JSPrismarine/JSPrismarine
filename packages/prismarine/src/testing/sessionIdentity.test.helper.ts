import type { PlayerIdentity } from '../playerIdentity';

/**
 * The identity a session double holds for a player of this name.
 *
 * A handler logs the name its session holds, so a test that checks a log line gives the session
 * the name it expects there.
 * @param name - The name the player logged in with.
 * @param uuid - The protocol identity, for a test that compares it.
 * @returns An identity with no XUID.
 */
export const identityNamed = (name: string, uuid = '00000000-0000-0000-0000-000000000000'): PlayerIdentity => ({
    name,
    xuid: '',
    uuid
});
