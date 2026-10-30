import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type BlockPickRequestPacket from '@jsprismarine/protocol/packet/BlockPickRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A block pick.
 *
 * The pick is recorded at debug level and dropped. Known gap: answering needs the block's
 * item form placed into the hotbar through `InventorySlotPacket` and `PlayerHotbarPacket`,
 * which the inventory code does not expose for a server-initiated pick yet.
 */
export default class BlockPickRequestHandler implements PacketHandler<BlockPickRequestPacket> {
    public static PacketName = 'BlockPickRequestPacket';
    public readonly phases = ['play'] as const;

    /** Logs the picked position. */
    public handle(packet: BlockPickRequestPacket, server: Server, session: PlayerSession): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a BlockPickRequestPacket without decoded data');
        const { position } = data;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} picked the block at ${position.x}, ${position.y}, ${position.z}${data.withData ? ' with data' : ''} (${data.maxSlots} free hotbar slots). Block picking is not implemented`,
                'BlockPickRequestHandler/handle'
            );
    }
}
