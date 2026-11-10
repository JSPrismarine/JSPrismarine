/**
 * Who a player is, as the server tells one account from another.
 *
 * A login names a player three ways, and they do not always agree.
 *
 * - The name. On an offline-mode server it is whatever the client typed. On an online-mode server
 *   it is the gamertag from the verified token, which the account owner can change.
 * - The XUID. On an online-mode server it is the verified Xbox Live id. On an offline-mode server
 *   it is a claim the client may leave empty or make up.
 * - The UUID. On an online-mode server it is the token's `leguuid`, or one derived from the
 *   XUID, and so fixed for the account. On an offline-mode server it is the client's
 *   `SelfSignedId`, which each client install draws at random: the same name logging in from a
 *   second device arrives with a second UUID, and two names can send the same one.
 *
 * {@link playerKeyOf} picks the one the server keys per-player services and the saved record by.
 * {@link sameAccount} is the wider test a login uses to find the sessions it replaces, so that no
 * two live players share any of the three.
 */

/** The three names a login gives a player. */
export interface PlayerIdentity {
    /** The display name. */
    readonly name: string;
    /** The Xbox Live id, or an empty string when the login carried none. */
    readonly xuid: string;
    /** The protocol identity, as a UUID string. */
    readonly uuid: string;
}

/**
 * The key per-player services and the saved player record use: the XUID, or the name when there
 * is no XUID.
 *
 * Not the UUID. On an offline-mode server the UUID is drawn per client install, so a returning
 * player on another device would not find their own record, while the name is what they type
 * each time. On an online-mode server the XUID is the verified account and survives a gamertag
 * change, and the UUID is derived from it, so the two give the same answer. The record has been
 * filed under this key since before services existed, and keeping one key for both means a
 * service and the record can never disagree about whose state they hold.
 *
 * Unique among live players because {@link sameAccount} matches on both the name and the XUID.
 * @param identity - The player's name and XUID.
 * @returns The XUID when there is one, otherwise the name.
 */
export const playerKeyOf = ({ name, xuid }: Pick<PlayerIdentity, 'name' | 'xuid'>): string => xuid || name;

/**
 * Whether two identities belong to the same account, for the purpose of letting only one of them
 * be live at a time.
 *
 * Any one of the three is enough. The name and XUID cover {@link playerKeyOf}. The UUID is what
 * the player list and the operator list are keyed by, so two live players sharing one would
 * collide there. An empty XUID matches nothing: every player on an offline-mode server has one.
 * @param a - One identity.
 * @param b - The other.
 * @returns True when the two share a name, a non-empty XUID or a UUID.
 */
export const sameAccount = (a: PlayerIdentity, b: PlayerIdentity): boolean =>
    a.name === b.name || (a.xuid !== '' && a.xuid === b.xuid) || a.uuid === b.uuid;
