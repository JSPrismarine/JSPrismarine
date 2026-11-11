import EmotePacket, { EmoteFlags } from '@jsprismarine/protocol/packet/EmotePacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/** The `8-4-4-4-12` hex form a client writes an emote piece id in. */
const EMOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A client asking to play an emote.
 *
 * A client only emotes as itself, so a packet naming another runtime id is dropped, as is one
 * whose emote id is not a uuid string. The emote is relayed as a fresh packet encoded by the
 * server, carrying the sender's own XUID and the `ServerSide` flag the docs require on the
 * copy the server sends, so a client cannot sign the emote with somebody else's account. The
 * server does not check that the sender owns the emote.
 */
export default class EmoteHandler implements InputLaneHandler<EmotePacket> {
    public static PacketName = 'EmotePacket';
    public readonly phases = ['play'] as const;
    // Relays to the players that see the sender, so it is an input though it writes nothing.
    public readonly lane = 'input';

    /** Relays the emote to the players that have the sender on screen and logs it. */
    public handle(packet: EmotePacket, { session, log, step }: InputContext): undefined {
        if (packet.actorRuntimeId !== session.runtimeId) {
            log.debug(
                `${session.identity.name} sent an Emote for runtime id ${packet.actorRuntimeId}, dropped`,
                'EmoteHandler/handle'
            );
            return;
        }

        if (!EMOTE_ID.test(packet.emoteId)) {
            log.debug(
                `${session.identity.name} sent an Emote whose id ${JSON.stringify(packet.emoteId)} is not a uuid, dropped`,
                'EmoteHandler/handle'
            );
            return;
        }

        const relay = new EmotePacket();
        relay.actorRuntimeId = session.runtimeId;
        relay.emoteId = packet.emoteId;
        relay.emoteLengthTicks = packet.emoteLengthTicks;
        // The server's record of who this is, not the client's. The field names the account
        // the emote belongs to, and it arrived from the one client that has every reason to
        // put somebody else's in it.
        relay.xuid = session.identity.xuid;
        relay.platformId = packet.platformId;
        relay.flags = packet.flags | EmoteFlags.ServerSide;

        // The sender's own world, and only the clients that have them on screen - the same
        // scope `AnimateHandler` relays an arm swing in. Through the session manager an emote
        // reached every player on the server, including ones in another world and ones that
        // were never sent a spawn for the actor the emote names.
        const others = session
            .getWorld()
            .getViewers()
            .filter((other) => other.runtimeId !== session.runtimeId)
            .filter((other) => other.tracks(session.runtimeId));
        for (const other of others) step.output(other.send(relay));

        log.debug(
            `${session.identity.name} played emote ${packet.emoteId} for ${packet.emoteLengthTicks} ticks, relayed to ${others.length} player(s)`,
            'EmoteHandler/handle'
        );
    }
}
