import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import EmotePacket, { EmoteFlags } from '../packet/EmotePacket';
import type PacketHandler from './PacketHandler';

/**
 * A client asking to play an emote.
 *
 * The emote is relayed to every other online player as a fresh packet carrying the sender's
 * own runtime id and the `ServerSide` flag, so a client cannot make another player's model
 * emote by naming its runtime id. The server does not check that the sender owns the emote.
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
        relay.xuid = packet.xuid;
        relay.platformId = packet.platformId;
        relay.flags = packet.flags | EmoteFlags.ServerSide;

        const others = server
            .getSessionManager()
            .getAllPlayers()
            .filter((other) => other !== player);
        await Promise.all(others.map((other) => other.getNetworkSession().send(relay)));

        server
            .getLogger()
            .debug(
                `${player.getName()} played emote ${packet.emoteId} for ${packet.emoteLengthTicks} ticks, relayed to ${others.length} player(s)`,
                'EmoteHandler/handle'
            );
    }
}
