import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import EmotePacket, { EmoteFlags } from '../packet/EmotePacket';
import type PacketHandler from './PacketHandler';

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
export default class EmoteHandler implements PacketHandler<EmotePacket> {
    public static NetID = Identifiers.EmotePacket;

    /** Relays the emote to the players that have the sender on screen and logs it. */
    public async handle(packet: EmotePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const logger = server.getLogger();

        if (packet.actorRuntimeId !== player.getRuntimeId()) {
            logger.debug(
                `${player.getName()} sent an Emote for runtime id ${packet.actorRuntimeId}, dropped`,
                'EmoteHandler/handle'
            );
            return;
        }

        if (!EMOTE_ID.test(packet.emoteId)) {
            logger.debug(
                `${player.getName()} sent an Emote whose id ${JSON.stringify(packet.emoteId)} is not a uuid, dropped`,
                'EmoteHandler/handle'
            );
            return;
        }

        const relay = new EmotePacket();
        relay.actorRuntimeId = player.getRuntimeId();
        relay.emoteId = packet.emoteId;
        relay.emoteLengthTicks = packet.emoteLengthTicks;
        // The server's record of who this is, not the client's. The field names the account
        // the emote belongs to, and it arrived from the one client that has every reason to
        // put somebody else's in it.
        relay.xuid = player.getXUID() ?? '';
        relay.platformId = packet.platformId;
        relay.flags = packet.flags | EmoteFlags.ServerSide;

        // The sender's own world, and only the clients that have them on screen - the same
        // scope `AnimateHandler` relays an arm swing in. Through the session manager an emote
        // reached every player on the server, including ones in another world and ones that
        // were never sent a spawn for the actor the emote names.
        const others = player
            .getWorld()
            .getPlayers()
            .filter((other) => other !== player)
            .filter((other) => other.getNetworkSession().tracks(player.getRuntimeId()));
        await Promise.all(others.map((other) => other.getNetworkSession().send(relay)));

        logger.debug(
            `${player.getName()} played emote ${packet.emoteId} for ${packet.emoteLengthTicks} ticks, relayed to ${others.length} player(s)`,
            'EmoteHandler/handle'
        );
    }
}
