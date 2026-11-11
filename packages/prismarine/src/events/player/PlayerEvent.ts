import type PlayerSession from '../../network/PlayerSession';
import type { PlayerIdentity } from '../../playerIdentity';
import { Event } from '../Event';

/**
 * Who a player event is about: the player's session, or anything that answers for it.
 *
 * The second form is for code that still holds the player object; package H-D of the entity and
 * tick re-architecture passes the session everywhere and drops it.
 */
export type PlayerEventSubject = PlayerSession | { getNetworkSession(): PlayerSession };

/**
 * The session a subject names.
 * @param subject - The session, or what answers for it.
 * @returns The session.
 */
const sessionOfSubject = (subject: PlayerEventSubject): PlayerSession =>
    'getNetworkSession' in subject ? subject.getNetworkSession() : subject;

/**
 * An event about one player.
 *
 * It names the player by its runtime id and the identity it logged in with, which stay right once
 * the player has left, and hands a listener that acts on the player its session.
 */
export default class PlayerEvent extends Event {
    private readonly subject: PlayerEventSubject;
    /** Found through the subject the first time a listener asks for it. */
    private session: PlayerSession | undefined;

    /**
     * @param subject - The player the event is about, as its session.
     */
    public constructor(subject: PlayerEventSubject) {
        super();
        this.subject = subject;
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
        this.session ??= sessionOfSubject(this.subject);
        return this.session;
    }
}
