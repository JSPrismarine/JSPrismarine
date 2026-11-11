import BlockPosition from '../../world/BlockPosition';
import type PlayerToggleCrafterSlotRequestPacket from '@jsprismarine/protocol/packet/PlayerToggleCrafterSlotRequestPacket';
import { blockTargetRejection } from './BlockTarget';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';

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
export default class PlayerToggleCrafterSlotRequestHandler implements ReadLaneHandler<PlayerToggleCrafterSlotRequestPacket> {
    public static PacketName = 'PlayerToggleCrafterSlotRequestPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Checks the position names a crafter in reach and the slot exists, then logs the toggle. */
    public handle(packet: PlayerToggleCrafterSlotRequestPacket, { session, log }: SessionContext): void {
        const where = `${packet.posX}, ${packet.posY}, ${packet.posZ}`;

        const rejection =
            packet.slotIndex >= CRAFTER_SLOTS
                ? `a crafter has no slot ${packet.slotIndex}`
                : blockTargetRejection(session, new BlockPosition(packet.posX, packet.posY, packet.posZ), CRAFTERS);
        if (rejection !== null) {
            log.verbose(
                `Dropped a crafter slot toggle from ${session.identity.name} at ${where}: ${rejection}`,
                'PlayerToggleCrafterSlotRequestHandler/handle'
            );
            return;
        }

        log.debug(
            `${session.identity.name} ${packet.isDisabled ? 'disabled' : 'enabled'} slot ${packet.slotIndex} of the crafter at ${where}. Crafters are not stored`,
            'PlayerToggleCrafterSlotRequestHandler/handle'
        );
    }
}
