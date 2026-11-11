import type EmoteListPacket from '@jsprismarine/protocol/packet/EmoteListPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A client's list of equipped emotes.
 *
 * Known gap: the server does not store a player's equipped emotes and does not forward them
 * to other players, so nobody else can download them.
 */
export default class EmoteListHandler implements ConnectionLaneHandler<EmoteListPacket> {
    public static PacketName = 'EmoteListPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /**
     * Drops a list naming another player's runtime id and accepts, without storing, one
     * for the sender.
     */
    public handle(packet: EmoteListPacket, { session, log }: SessionContext): void {
        // `Runtime id` names whose emotes these are, and a client only equips its own.
        if (packet.runtimeId !== session.runtimeId) {
            log.debug(
                `${session.identity.name} sent an EmoteList for runtime id ${packet.runtimeId}, dropped`,
                'EmoteListHandler/handle'
            );
        }
    }
}
