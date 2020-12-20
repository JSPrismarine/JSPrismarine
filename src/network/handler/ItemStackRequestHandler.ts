import type ItemStackRequestPacket from '../packet/ItemStackRequestPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class ItemStackRequestHandler
    implements PacketHandler<ItemStackRequestPacket> {
    public handle(
        packet: ItemStackRequestPacket,
        server: Server,
        player: Player
    ): void {}
}
