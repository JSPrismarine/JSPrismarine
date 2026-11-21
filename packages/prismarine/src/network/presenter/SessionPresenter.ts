/**
 * What the server asks one session's client to show, in no edition's terms
 * ([ADR 0026](../../../../../docs/adr/0026-java-is-a-second-protocol-family-over-one-world.md)).
 *
 * A session owns one presenter, chosen by the edition its client speaks, and the presenter turns
 * each call into that edition's packets. Nothing outside a presenter builds an outbound packet
 * for a session's own client once the contract covers it. The contract grows slice by slice, as
 * the plan in `docs/plans/java-multiprotocol.md` describes, from what each slice moves out of
 * `PlayerSession`.
 *
 * Every method queues its packets before it returns and hands back a promise that settles once
 * the transport has taken them, the way `PlayerSession`'s sends always have, so a caller in the
 * input step can hand that promise to the step's outputs.
 */
import type { Gametype } from '@jsprismarine/minecraft';

/** The outbound contract of one session. */
export interface SessionPresenter {
    /**
     * Tells the client the world's time of day.
     *
     * @param tick - The time, in ticks.
     */
    sendTime(tick: number): Promise<void>;

    /**
     * Tells the client its own game mode.
     *
     * @param gamemode - The game mode the player now has.
     */
    sendGamemode(gamemode: Gametype): Promise<void>;

    /**
     * Tells the client the server's default game mode.
     *
     * @param gamemode - The default the server holds.
     */
    sendDefaultGameMode(gamemode: Gametype): Promise<void>;

    /**
     * Answers a client that closed a container screen.
     *
     * An edition whose client waits for the server to confirm a close answers here; one whose
     * client does not sends nothing.
     *
     * @param window - The window the client closed.
     * @param clientContainerType - The container type the client named with the close, which an
     *   edition that echoes it puts in the answer.
     */
    containerClosed(window: number, clientContainerType: number): Promise<void>;
}
