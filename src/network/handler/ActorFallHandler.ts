import type ActorFallPacket from '../packet/ActorFallPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';

export default class ActorFallHandler
    implements PacketHandler<ActorFallPacket> {
    public handle(
        packet: ActorFallPacket,
        server: Prismarine,
        player: Player
    ): void {}
}
