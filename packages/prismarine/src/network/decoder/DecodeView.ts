/**
 * What a decoder may read about the sender while turning a packet into intents
 * ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * The view is the session's own state and nothing of the world: who the sender is, which actors
 * they have been shown, their game mode. It lets a decoder refuse a packet that names someone
 * else or an actor the client has never seen, which is what a packet handler checked before it
 * called into the session. Reading the world is the intent handler's, in its lane.
 */
import type { Gametype } from '@jsprismarine/minecraft';
import type { HandlerLog } from '../handler/HandlerContext';
import type PlayerSession from '../PlayerSession';

/** The session state a decoder reads. */
export interface SessionView {
    /** The sender's runtime id, which a client names when it means itself. */
    readonly runtimeId: bigint;
    /** The sender's display name, for log lines. */
    readonly name: string;
    /** The sender's game mode. */
    readonly gamemode: Gametype;
    /**
     * Whether the sender has been shown the actor with `runtimeId`, so a packet may name it.
     *
     * @param runtimeId - An actor's runtime id.
     */
    tracks(runtimeId: bigint): boolean;
}

/** The view and where a decoder says why it dropped a packet. */
export interface DecodeView extends SessionView {
    /** Where a dropped packet is explained, at debug level. */
    readonly log: HandlerLog;
}

/**
 * The view of a live session. Each member reads the session when the decoder asks, so a session
 * whose player is still being built fails only a decoder that reads the player.
 *
 * @param session - The session the packet arrived on.
 * @param log - Where the decoder logs.
 */
export const viewOf = (session: PlayerSession, log: HandlerLog): DecodeView => ({
    log,
    get runtimeId() {
        return session.runtimeId;
    },
    get name() {
        return session.identity.name;
    },
    get gamemode() {
        return session.getPlayer().gamemode;
    },
    tracks: (runtimeId) => session.tracks(runtimeId)
});
