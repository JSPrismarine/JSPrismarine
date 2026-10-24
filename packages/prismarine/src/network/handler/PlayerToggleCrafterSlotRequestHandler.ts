import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type PlayerToggleCrafterSlotRequestPacket from '../packet/PlayerToggleCrafterSlotRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A crafter slot toggle.
 *
 * The toggle is recorded at debug level and dropped. Known gap: the crafter block has no
 * block entity here, so there is no slot state to flip or to send back.
 */
export default class PlayerToggleCrafterSlotRequestHandler implements PacketHandler<PlayerToggleCrafterSlotRequestPacket> {
    public static NetID = Identifiers.PlayerToggleCrafterSlotRequestPacket;

    /** Logs the slot and the crafter position. */
    public handle(packet: PlayerToggleCrafterSlotRequestPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ${packet.isDisabled ? 'disabled' : 'enabled'} slot ${packet.slotIndex} of the crafter at ${packet.posX}, ${packet.posY}, ${packet.posZ}. Crafters are not stored`,
                'PlayerToggleCrafterSlotRequestHandler/handle'
            );
    }
}
