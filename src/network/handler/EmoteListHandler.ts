import type EmoteListPacket from '../packet/EmoteListPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class EmoteListHandler
    implements PacketHandler<EmoteListPacket> {
    public handle(
        packet: EmoteListPacket,
        server: Server,
        player: Player
    ): void {}
}
