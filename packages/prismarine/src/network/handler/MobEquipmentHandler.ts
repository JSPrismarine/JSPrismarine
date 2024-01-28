import Identifiers from '../Identifiers.js';
import MobEquipmentPacket from '../packet/MobEquipmentPacket.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import Server from '../../Server.js';

export default class MobEquipmentHandler implements PacketHandler<MobEquipmentPacket> {
    public static NetID = Identifiers.MobEquipmentPacket;

    public handle(_packet: MobEquipmentPacket, _server: Server, _session: PlayerSession): void {
        // TODO
    }
}
