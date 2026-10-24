import type EmoteListPacket from '../packet/EmoteListPacket';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';

/** Accepts a client's equipped emote list and drops it. */
export default class EmoteListHandler implements PacketHandler<EmoteListPacket> {
    public static NetID = Identifiers.EmoteListPacket;

    /**
     * Does nothing with the packet.
     *
     * Known gap: the server does not store a player's equipped emotes and does not forward
     * them to other players, so nobody else can download them.
     */
    public handle(_packet: EmoteListPacket, _server: Server, _session: PlayerSession): void {}
}
