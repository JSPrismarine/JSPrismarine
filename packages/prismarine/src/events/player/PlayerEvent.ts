import type PlayerSession from '../../network/PlayerSession';
import type { PlayerIdentity } from '../../playerIdentity';
import { Event } from '../Event';

/**
 * An event about one player.
 *
 * It names the player by its runtime id and the identity it logged in with, which stay right once
 * the player has left, and hands a listener that acts on the player its session.
 */
export default class PlayerEvent extends Event {
    private readonly session: PlayerSession;

    /**
     * @param session - The session of the player the event is about.
     */
    public constructor(session: PlayerSession) {
        super();
        this.session = session;
    }

    /**
     * The player's runtime id, which the wire and the player's session use.
     * @returns The id.
     */
    public getRuntimeId(): bigint {
        return this.getSession().runtimeId;
    }

    /**
     * Who the player logged in as.
     * @returns The name, the XUID (empty when the login carried none) and the UUID.
     */
    public getIdentity(): PlayerIdentity {
        return this.getSession().identity;
    }

    /**
     * The session of the player the event is about, for a listener that acts on the player: it
     * sends to the client, and `getPlayer()` reaches the player's state while it is connected.
     * To name the player, read {@link PlayerEvent.getRuntimeId} or {@link PlayerEvent.getIdentity}.
     * @returns The session.
     */
    public getSession(): PlayerSession {
        return this.session;
    }
}
