import type BlockPickRequestPacket from '@jsprismarine/protocol/packet/BlockPickRequestPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A block pick.
 *
 * The pick is recorded at debug level and dropped. Known gap: answering needs the block's
 * item form placed into the hotbar through `InventorySlotPacket` and `PlayerHotbarPacket`,
 * which the inventory code does not expose for a server-initiated pick yet.
 */
export default class BlockPickRequestHandler implements ConnectionLaneHandler<BlockPickRequestPacket> {
    public static PacketName = 'BlockPickRequestPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the picked position. */
    public handle(packet: BlockPickRequestPacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a BlockPickRequestPacket without decoded data');
        const { position } = data;

        log.debug(
            `${session.identity.name} picked the block at ${position.x}, ${position.y}, ${position.z}${data.withData ? ' with data' : ''} (${data.maxSlots} free hotbar slots). Block picking is not implemented`,
            'BlockPickRequestHandler/handle'
        );
    }
}
