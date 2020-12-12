import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type EmoteListPacket from '../packet/EmoteListPacket';
import PacketHandler from './PacketHandler';

export default class EmoteListHandler
    implements PacketHandler<EmoteListPacket> {
    public handle(
        packet: EmoteListPacket,
        server: Prismarine,
        player: Player
    ): void {}
}
