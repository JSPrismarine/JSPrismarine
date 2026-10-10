import Identifiers from '../Identifiers';
import type MobEquipmentPacket from '../packet/MobEquipmentPacket';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';

export default class MobEquipmentHandler implements PacketHandler<MobEquipmentPacket> {
    public static NetID = Identifiers.MobEquipmentPacket;

    /**
     * The client has changed which hotbar slot it holds.
     *
     * Only the slot is taken. The stack the client names alongside it is its own view of the
     * inventory, and the server's copy is the one that decides what a player is holding.
     */
    public handle(packet: MobEquipmentPacket, _server: Server, session: PlayerSession): void {
        session.getPlayer().getInventory().setHandSlot(packet.hotbarSlot);
    }
}
