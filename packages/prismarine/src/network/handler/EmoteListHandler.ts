import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type EmoteListPacket from '../packet/EmoteListPacket';
import type PacketHandler from './PacketHandler';

/**
 * A client's list of equipped emotes.
 *
 * Known gap: the server does not store a player's equipped emotes and does not forward them
 * to other players, so nobody else can download them.
 */
export default class EmoteListHandler implements PacketHandler<EmoteListPacket> {
    public static PacketName = 'EmoteListPacket';

    /**
     * Drops a list naming another player's runtime id and accepts, without storing, one
     * for the sender.
     */
    public handle(packet: EmoteListPacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();

        // `Runtime id` names whose emotes these are, and a client only equips its own.
        if (packet.runtimeId !== player.getRuntimeId()) {
            server
                .getLogger()
                .debug(
                    `${player.getName()} sent an EmoteList for runtime id ${packet.runtimeId}, dropped`,
                    'EmoteListHandler/handle'
                );
        }
    }
}
