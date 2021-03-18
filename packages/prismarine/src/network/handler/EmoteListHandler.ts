import type EmoteListPacket from '../packet/EmoteListPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class EmoteListHandler implements PacketHandler<EmoteListPacket> {
    public static NetID = Identifiers.EmoteListPacket;

    public handle(packet: EmoteListPacket, server: Server, player: Player): void {
        // TODO: stub
    }
}
