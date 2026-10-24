import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import EmotePacket, { EmoteFlags } from '../packet/EmotePacket';
import type PacketHandler from './PacketHandler';

/**
 * A client asking to play an emote.
 *
 * The emote is relayed as a fresh packet carrying the sender's own runtime id, the sender's
 * own XUID and the `ServerSide` flag, so a client can neither make another player's model
 * emote by naming its runtime id nor sign the emote with somebody else's account. The server
 * does not check that the sender owns the emote.
 */
export default class EmoteHandler implements PacketHandler<EmotePacket> {
    public static NetID = Identifiers.EmotePacket;

    /** Relays the emote to the other players and logs it. */
    public async handle(packet: EmotePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

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

        server
            .getLogger()
            .debug(
                `${player.getName()} played emote ${packet.emoteId} for ${packet.emoteLengthTicks} ticks, relayed to ${others.length} player(s)`,
                'EmoteHandler/handle'
            );
    }
}
