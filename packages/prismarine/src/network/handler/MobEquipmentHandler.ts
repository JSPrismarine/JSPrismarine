import Identifiers from '../Identifiers';
import MobEquipmentPacket from '../packet/MobEquipmentPacket';
import PacketHandler from './PacketHandler';
import { PlayerSession } from '../../';
import Server from '../../Server';

export default class MobEquipmentHandler implements PacketHandler<MobEquipmentPacket> {
    public static NetID = Identifiers.MobEquipmentPacket;

    public handle(_packet: MobEquipmentPacket, _server: Server, _session: PlayerSession): void {
        // TODO
    }
}
