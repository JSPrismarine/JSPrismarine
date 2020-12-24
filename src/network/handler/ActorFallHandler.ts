import type ActorFallPacket from '../packet/ActorFallPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class ActorFallHandler
    implements PacketHandler<ActorFallPacket> {
    public handle(
        packet: ActorFallPacket,
        server: Server,
        player: Player
    ): void {}
}
