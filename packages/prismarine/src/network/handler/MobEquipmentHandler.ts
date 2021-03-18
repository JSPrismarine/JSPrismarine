import Identifiers from '../Identifiers';
import MobEquipmentPacket from '../packet/MobEquipmentPacket';
import PacketHandler from './PacketHandler';
import Player from '../../player/Player';
import Server from '../../Server';

export default class MobEquipmentHandler implements PacketHandler<MobEquipmentPacket> {
    public static NetID = Identifiers.MobEquipmentPacket;

    public handle(packet: MobEquipmentPacket, server: Server, player: Player): void {
        // TODO
    }
}
