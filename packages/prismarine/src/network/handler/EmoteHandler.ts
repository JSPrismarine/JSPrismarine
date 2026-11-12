import type EmotePacket from '@jsprismarine/protocol/packet/EmotePacket';
import { EmoteFlags } from '@jsprismarine/protocol/packet/EmotePacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';
import { isUuid } from '../../utils/isUuid';

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
    // Logs an occurrence that replication relays to the players that see the sender.
    public readonly lane = 'input';

    /** Relays the emote to the players that have the sender on screen and logs it at debug level. */
    public handle(packet: EmotePacket, { session, log }: InputContext): undefined {
        if (packet.actorRuntimeId !== session.runtimeId) {
            log.debug(
                `${session.identity.name} sent an Emote for runtime id ${packet.actorRuntimeId}, dropped`,
                'EmoteHandler/handle'
            );
            return;
        }

        if (!isUuid(packet.emoteId)) {
            log.debug(
                `${session.identity.name} sent an Emote whose id ${JSON.stringify(packet.emoteId)} is not a uuid, dropped`,
                'EmoteHandler/handle'
            );
            return;
        }

        // The sender's own world, and only the clients that have them on screen - the same
        // scope `AnimateHandler` relays an arm swing in - which replication works out when the
        // tick seals. Through the session manager an emote reached every player on the server,
        // including ones in another world and ones that were never sent a spawn for the actor
        // the emote names.
        session.getWorld().relayEmote({
            entity: session.runtimeId,
            emote: packet.emoteId,
            lengthTicks: packet.emoteLengthTicks,
            // The server's record of who this is, not the client's. The field names the account
            // the emote belongs to, and it arrived from the one client that has every reason to
            // put somebody else's in it.
            xuid: session.identity.xuid,
            platformId: packet.platformId,
            flags: packet.flags | EmoteFlags.ServerSide
        });

        log.debug(
            `${session.identity.name} played emote ${packet.emoteId} for ${packet.emoteLengthTicks} ticks`,
            'EmoteHandler/handle'
        );
    }
}
