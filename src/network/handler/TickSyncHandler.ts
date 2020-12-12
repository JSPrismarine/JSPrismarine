import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type TickSyncPacket from '../packet/TickSyncPacket';
import PacketHandler from './PacketHandler';

export default class TickSyncHandler implements PacketHandler<TickSyncPacket> {
    public handle(
        packet: TickSyncPacket,
        server: Prismarine,
        player: Player
    ): void {}
}
