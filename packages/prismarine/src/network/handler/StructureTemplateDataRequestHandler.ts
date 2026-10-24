import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type StructureTemplateDataRequestPacket from '../packet/StructureTemplateDataRequestPacket';
import { StructureTemplateRequestOperation } from '../packet/StructureTemplateDataRequestPacket';
import type PacketHandler from './PacketHandler';

/**
 * A structure block asking for a structure's data.
 *
 * The request is recorded at debug level and dropped. Mojang's docs say the feature is
 * switched off server-side, and this server has no structure template storage to answer from,
 * so no `StructureTemplateDataResponsePacket` is sent.
 */
export default class StructureTemplateDataRequestHandler implements PacketHandler<StructureTemplateDataRequestPacket> {
    public static NetID = Identifiers.StructureTemplateDataRequestPacket;

    /** Logs the structure name and the operation asked for. */
    public handle(packet: StructureTemplateDataRequestPacket, server: Server, session: PlayerSession): void {
        const operation = StructureTemplateRequestOperation[packet.requestedOperation] ?? packet.requestedOperation;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} requested structure ${packet.structureName} with operation ${operation}. The server stores no structure templates`,
                'StructureTemplateDataRequestHandler/handle'
            );
    }
}
