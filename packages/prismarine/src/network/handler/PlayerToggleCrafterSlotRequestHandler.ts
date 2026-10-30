import type Server from '../../Server';
import BlockPosition from '../../world/BlockPosition';
import type PlayerSession from '../PlayerSession';
import type PlayerToggleCrafterSlotRequestPacket from '@jsprismarine/protocol/packet/PlayerToggleCrafterSlotRequestPacket';
import { blockTargetRejection } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/** The one block whose screen sends this packet. */
const CRAFTERS: ReadonlySet<string> = new Set(['minecraft:crafter']);

/** A crafter has a three by three grid, so a slot index runs from 0 to 8. */
const CRAFTER_SLOTS = 9;

/**
 * A crafter slot toggle.
 *
 * A toggle whose position is not a crafter within reach in a loaded chunk, or whose slot is
 * not one of the nine, is dropped at verbose level. The rest are recorded at debug level and
 * dropped too. Known gap: the crafter block has no block entity here, so there is no slot
 * state to flip or to send back.
 */
export default class PlayerToggleCrafterSlotRequestHandler implements PacketHandler<PlayerToggleCrafterSlotRequestPacket> {
    public static PacketName = 'PlayerToggleCrafterSlotRequestPacket';
    public readonly phases = ['play'] as const;

    /** Checks the position names a crafter in reach and the slot exists, then logs the toggle. */
    public handle(packet: PlayerToggleCrafterSlotRequestPacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();
        const where = `${packet.posX}, ${packet.posY}, ${packet.posZ}`;

        const rejection =
            packet.slotIndex >= CRAFTER_SLOTS
                ? `a crafter has no slot ${packet.slotIndex}`
                : blockTargetRejection(player, new BlockPosition(packet.posX, packet.posY, packet.posZ), CRAFTERS);
        if (rejection !== null) {
            server
                .getLogger()
                .verbose(
                    `Dropped a crafter slot toggle from ${player.getName()} at ${where}: ${rejection}`,
                    'PlayerToggleCrafterSlotRequestHandler/handle'
                );
            return;
        }

        server
            .getLogger()
            .debug(
                `${player.getName()} ${packet.isDisabled ? 'disabled' : 'enabled'} slot ${packet.slotIndex} of the crafter at ${where}. Crafters are not stored`,
                'PlayerToggleCrafterSlotRequestHandler/handle'
            );
    }
}
