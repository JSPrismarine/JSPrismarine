import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type StructureBlockUpdatePacket from '@jsprismarine/protocol/packet/StructureBlockUpdatePacket';
import BlockPosition from '../../world/BlockPosition';
import { blockTargetRejection } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/** The one block whose screen sends this packet. */
const STRUCTURE_BLOCKS: ReadonlySet<string> = new Set(['minecraft:structure_block']);

/**
 * The settings a player left in the structure block screen.
 *
 * A packet whose position is not a structure block within reach in a loaded chunk is dropped
 * at verbose level. The rest are recorded at debug level and dropped too. Known gap: the
 * server has no structure block entity to store the settings in and no structure storage to
 * save or load from, so nothing can be exported, placed or triggered.
 */
export default class StructureBlockUpdateHandler implements PacketHandler<StructureBlockUpdatePacket> {
    public static PacketName = 'StructureBlockUpdatePacket';
    public readonly phases = ['play'] as const;

    /** Checks the position names a structure block in reach, then logs the structure name. */
    public handle(packet: StructureBlockUpdatePacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a StructureBlockUpdatePacket without decoded data');

        const blockPosition = new BlockPosition(data.blockPosition.x, data.blockPosition.y, data.blockPosition.z);
        const where = `${blockPosition.getX()}, ${blockPosition.getY()}, ${blockPosition.getZ()}`;

        const rejection = blockTargetRejection(player, blockPosition, STRUCTURE_BLOCKS);
        if (rejection !== null) {
            server
                .getLogger()
                .verbose(
                    `Dropped a structure block update from ${player.getName()} at ${where}: ${rejection}`,
                    'StructureBlockUpdateHandler/handle'
                );
            return;
        }

        const name = data.structureData.structureName.unredacted;
        server
            .getLogger()
            .debug(
                `${player.getName()} set the structure block at ${where} to structure "${name}". Structure blocks are not stored`,
                'StructureBlockUpdateHandler/handle'
            );
    }
}
