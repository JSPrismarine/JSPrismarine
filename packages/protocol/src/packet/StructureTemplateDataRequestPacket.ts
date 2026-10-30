import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';
import { readStructureSettings, writeStructureSettings } from '../structure/StructureSettings';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { StructureSettings } from '../structure/StructureSettings';

/** What the client asked the structure block server to do. */
export enum StructureTemplateRequestOperation {
    None = 0,
    ExportFromSaveMode = 1,
    ExportFromLoadMode = 2,
    QuerySavedStructure = 3
}

/** A request for a saved structure or its export data. */
export interface StructureTemplateDataRequest {
    /** Structure name entered in the structure block. */
    structureName: string;
    /** Position of the structure block. */
    structurePosition: BlockPos;
    /** Bounds and placement settings supplied by the client. */
    structureSettings: StructureSettings;
    /** Requested structure operation. */
    requestedOperation: StructureTemplateRequestOperation;
}

/**
 * Requests data for a structure named in the structure block screen.
 *
 * Protocol 2193 layout: `Structure Name` (string), `Structure Position` (`BlockPos`),
 * `Structure Settings`, then `Requested Operation` (uint8). Mojang documents this feature as
 * disabled server-side.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/structure-template-data-request-packet/
 */
export default class StructureTemplateDataRequestPacket extends NetworkPacket<StructureTemplateDataRequest> {
    public get id(): number {
        return PacketIdentifier.STRUCTURE_TEMPLATE_DATA_REQUEST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StructureTemplateDataRequest): void {
        stream.writeString(data.structureName);
        data.structurePosition.serialize(stream);
        writeStructureSettings(stream, data.structureSettings);
        stream.writeByte(data.requestedOperation);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StructureTemplateDataRequest {
        const structureName = stream.readString();
        const structurePosition = new BlockPos(0, 0, 0);
        structurePosition.deserialize(stream);
        const structureSettings = readStructureSettings(stream);
        const requestedOperation: StructureTemplateRequestOperation = stream.readByte();
        return { structureName, structurePosition, structureSettings, requestedOperation };
    }
}
