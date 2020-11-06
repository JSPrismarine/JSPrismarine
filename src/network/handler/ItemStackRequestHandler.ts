import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import type ItemStackRequestPacket from '../packet/item-stack-request';

export default class ItemStackRequestHandler {
    static NetID = Identifiers.ItemStackRequestPacket;

    static handle(
        packet: ItemStackRequestPacket,
        server: Prismarine,
        player: Player
    ) {}
}
