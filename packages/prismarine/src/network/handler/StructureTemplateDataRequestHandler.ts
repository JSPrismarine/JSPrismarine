import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type StructureTemplateDataRequestPacket from '../packet/StructureTemplateDataRequestPacket';
import { StructureTemplateRequestOperation } from '../packet/StructureTemplateDataRequestPacket';
import { blockTargetRejection } from './BlockTarget';
import type PacketHandler from './PacketHandler';

/** The one block whose screen sends this packet. */
const STRUCTURE_BLOCKS: ReadonlySet<string> = new Set(['minecraft:structure_block']);

/**
 * A structure block asking for a structure's data.
 *
 * A request whose position is not a structure block within reach in a loaded chunk is
 * dropped at verbose level. The rest are recorded at debug level and dropped too. Mojang's
 * docs say the feature is switched off server-side, and this server has no structure
 * template storage to answer from, so no `StructureTemplateDataResponsePacket` is sent.
 */
export default class StructureTemplateDataRequestHandler implements PacketHandler<StructureTemplateDataRequestPacket> {
    public static PacketName = 'StructureTemplateDataRequestPacket';
    public readonly phases = ['play'] as const;

    /** Checks the position names a structure block in reach, then logs the name and operation. */
    public handle(packet: StructureTemplateDataRequestPacket, server: Server, session: PlayerSession): void {
        const player = session.getPlayer();
        const { structurePosition } = packet;

        const rejection = blockTargetRejection(player, structurePosition, STRUCTURE_BLOCKS);
        if (rejection !== null) {
            server
                .getLogger()
                .verbose(
                    `Dropped a structure template request from ${player.getName()} at ${structurePosition.getX()}, ${structurePosition.getY()}, ${structurePosition.getZ()}: ${rejection}`,
                    'StructureTemplateDataRequestHandler/handle'
                );
            return;
        }

        const operation = StructureTemplateRequestOperation[packet.requestedOperation] ?? packet.requestedOperation;
        server
            .getLogger()
            .debug(
                `${player.getName()} requested structure ${packet.structureName} with operation ${operation}. The server stores no structure templates`,
                'StructureTemplateDataRequestHandler/handle'
            );
    }
}
