import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type ItemStackRequestPacket from '../packet/ItemStackRequestPacket';
import PacketHandler from './PacketHandler';

export default class ItemStackRequestHandler
    implements PacketHandler<ItemStackRequestPacket> {
    public handle(
        packet: ItemStackRequestPacket,
        server: Prismarine,
        player: Player
    ): void {}
}
