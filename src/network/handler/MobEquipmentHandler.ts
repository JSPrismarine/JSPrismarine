import MobEquipmentPacket from '../packet/MobEquipmentPacket';
import PacketHandler from './PacketHandler';
import Player from '../../player/Player';
import Prismarine from '../../Prismarine';

export default class MobEquipmentHandler
    implements PacketHandler<MobEquipmentPacket> {
    public handle(
        packet: MobEquipmentPacket,
        server: Prismarine,
        player: Player
    ): void {
        // TODO
    }
}
