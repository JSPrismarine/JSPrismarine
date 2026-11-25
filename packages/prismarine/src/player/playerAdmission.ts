/**
 * Whether a login is let in, the same for both editions: the ban list, the allow list and the
 * player limit, each checked against the account the login proved. Each edition tells its client
 * a refusal in its own words.
 */
import type { PlayerIdentity } from '../playerIdentity';
import type { LoginServices } from '../network/handler/ConnectionContext';

/** Why a login is turned away. */
export type LoginRefusal =
    /** The account is banned; `reason` is empty when the ban gave none. */
    | { readonly kind: 'banned'; readonly reason: string }
    /** The allow list is on and the account is not on it. */
    | { readonly kind: 'notInvited' }
    /** The server has as many players as it takes, and the account's allow list entry does not ignore that. */
    | { readonly kind: 'full' };

/**
 * Checks a login against the lists and the player limit.
 *
 * An operator entry or a ban written before subjects existed is keyed by the name; claimed here,
 * it is this account's from now on. The player limit is checked last, since an allow list entry
 * that ignores it lets its player in anyway.
 * @param login - The lists and the sessions.
 * @param account - The account the login proved, before any link: a ban of the linked account
 *   keeps it out whichever account it is linked to.
 * @param maxPlayers - The player limit.
 * @returns Why the login is refused, or undefined when it is let in.
 */
export const loginRefusalOf = async (
    login: Pick<LoginServices, 'sessions' | 'bans' | 'allowList' | 'permissions'>,
    account: PlayerIdentity,
    maxPlayers: number
): Promise<LoginRefusal | undefined> => {
    login.permissions.claimLegacy(account);
    await login.bans.claimLegacy(account);
    const banned = login.bans.isBanned(account);
    if (banned !== false) return { kind: 'banned', reason: banned === true ? '' : banned };
    const listed = { name: account.name, ...(account.xuid ? { xuid: account.xuid } : {}) };
    if (!login.allowList.allows(listed)) return { kind: 'notInvited' };
    if (login.sessions.getSessions().length >= maxPlayers && !login.allowList.ignoresPlayerLimit(listed)) {
        return { kind: 'full' };
    }
    return undefined;
};
