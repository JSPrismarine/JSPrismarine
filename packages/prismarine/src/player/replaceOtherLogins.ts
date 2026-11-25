/**
 * One live player per account, for both editions: a login that is let in replaces every other
 * connection playing as the same account.
 */
import { DisconnectReason } from '@jsprismarine/minecraft';

import type ClientConnection from '../network/ClientConnection';
import type { LoginServices } from './context/ConnectionContext';
import type { PlayerIdentity } from '../playerIdentity';

/** What a login replacing another session of the same account tells the one it replaces. */
const REPLACED = 'Logged in from another location';

/**
 * Takes `account` for `connection` and disconnects every other connection holding it, a Bedrock
 * or a Java one, each once its own join has settled. One live player per account (#2951), and a
 * linked account holds the primary's, so either edition's login replaces the other's.
 * @param login - The sessions the account is claimed in, and where a removal waits its turn.
 * @param connection - The connection whose login is being let in.
 * @param account - The account it plays as, after any link is resolved.
 * @param joined - Settles when this connection's join has finished or failed.
 */
export const replaceOtherLogins = async (
    login: Pick<LoginServices, 'sessions' | 'removeAsInput'>,
    connection: ClientConnection,
    account: PlayerIdentity,
    joined: Promise<void>
): Promise<void> => {
    for (const replaced of login.sessions.claimIdentity(connection, account, joined)) {
        await replaced.joined;
        const replacedSession = replaced.connection.getPlayerSession();
        // A removal is an input: the replaced client's earlier inputs are applied first.
        if (replacedSession)
            await login.removeAsInput(replaced.connection, () =>
                replacedSession.kick(REPLACED, DisconnectReason.LOGGED_IN_OTHER_LOCATION)
            );
        else await replaced.connection.disconnect(REPLACED, false, DisconnectReason.LOGGED_IN_OTHER_LOCATION);
    }
};
