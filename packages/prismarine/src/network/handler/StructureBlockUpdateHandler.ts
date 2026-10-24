import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type StructureBlockUpdatePacket from '../packet/StructureBlockUpdatePacket';
import type PacketHandler from './PacketHandler';

/**
 * The settings a player left in the structure block screen.
 *
 * The settings are recorded at debug level and dropped. Known gap: the server has no
 * structure block entity to store them in and no structure storage to save or load from, so
 * nothing can be exported, placed or triggered.
 */
export default class StructureBlockUpdateHandler implements PacketHandler<StructureBlockUpdatePacket> {
    public static NetID = Identifiers.StructureBlockUpdatePacket;

    /** Logs the structure name and the block's position. */
    public handle(packet: StructureBlockUpdatePacket, server: Server, session: PlayerSession): void {
        const { blockPosition } = packet;
        const name = packet.structureData.structureName.unredacted;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} set the structure block at ${blockPosition.getX()}, ${blockPosition.getY()}, ${blockPosition.getZ()} to structure "${name}". Structure blocks are not stored`,
                'StructureBlockUpdateHandler/handle'
            );
    }
}
