import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import {
    StructureTemplateResponseType,
    structureTemplateDataResponsePacket
} from '../wire/definitions/structureTemplateDataResponse';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { StructureTemplateDataResponsePayload } from '../wire/definitions/structureTemplateDataResponse';

export { StructureTemplateResponseType };

/** The template returned for a structure request. */
export type StructureTemplateDataResponse = StructureTemplateDataResponsePayload;

/**
 * Returns a structure template or reports that none was found.
 *
 * The protocol reference leaves `Structure's NBT` as an unknown field. The observed 2193
 * layout uses a success boolean followed by the network NBT compound when present, then
 * `Response Type` (uint8). The response type follows the compound directly, which occupies
 * only its own NBT bytes.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/structure-template-data-response-packet/
 */
export default class StructureTemplateDataResponsePacket extends NetworkPacket<StructureTemplateDataResponse> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'StructureTemplateDataResponsePacket';
    }

    public get id(): number {
        return PacketIdentifier.STRUCTURE_TEMPLATE_DATA_RESPONSE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StructureTemplateDataResponse): void {
        layoutAt(structureTemplateDataResponsePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StructureTemplateDataResponse {
        return layoutAt(structureTemplateDataResponsePacket, this.codecProtocol).decode(stream);
    }
}
