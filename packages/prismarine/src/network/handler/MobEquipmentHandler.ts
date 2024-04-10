import Identifiers from '../Identifiers';
import type MobEquipmentPacket from '../packet/MobEquipmentPacket';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';

export default class MobEquipmentHandler implements PacketHandler<MobEquipmentPacket> {
    public static NetID = Identifiers.MobEquipmentPacket;

    public handle(_packet: MobEquipmentPacket, _server: Server, _session: PlayerSession): void {
        // TODO
    }
}
