import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type ActorFallPacket from '../packet/ActorFallPacket';
import PacketHandler from './PacketHandler';

export default class ActorFallHandler
    implements PacketHandler<ActorFallPacket> {
    public handle(
        packet: ActorFallPacket,
        server: Prismarine,
        player: Player
    ): void {}
}
