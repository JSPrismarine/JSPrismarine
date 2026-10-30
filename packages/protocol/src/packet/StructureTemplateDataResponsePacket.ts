import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader, NBTWriter } from '@jsprismarine/nbt';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** Which structure operation the response answers. */
export enum StructureTemplateResponseType {
    None = 0,
    Export = 1,
    Query = 2
}

/** The template returned for a structure request. */
export interface StructureTemplateDataResponse {
    /** Structure name from the request. */
    structureName: string;
    /** Template returned to the client, or `null` when no template was found. */
    structureTemplate: NBTTagCompound | null;
    /** Kind of request this response answers. */
    responseType: StructureTemplateResponseType;
}

/**
 * Returns a structure template or reports that none was found.
 *
 * The protocol reference leaves `Structure's NBT` as an unknown field. The observed 2193
 * layout uses a success boolean followed by the network NBT compound when present, then
 * `Response Type` (uint8). The response type follows the compound directly, which occupies
 * only its own NBT bytes.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/structure-template-data-response-packet/
 */
export default class StructureTemplateDataResponsePacket extends NetworkPacket<StructureTemplateDataResponse> {
    public get id(): number {
        return PacketIdentifier.STRUCTURE_TEMPLATE_DATA_RESPONSE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StructureTemplateDataResponse): void {
        stream.writeString(data.structureName);
        stream.writeBoolean(data.structureTemplate !== null);
        if (data.structureTemplate !== null) {
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            writer.writeCompound(data.structureTemplate);
        }
        stream.writeByte(data.responseType);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StructureTemplateDataResponse {
        const structureName = stream.readString();
        const structureTemplate = stream.readBoolean()
            ? (() => {
                  const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
                  reader.setUseVarint(true);
                  return reader.parse();
              })()
            : null;
        const responseType: StructureTemplateResponseType = stream.readByte();
        return { structureName, structureTemplate, responseType };
    }
}
