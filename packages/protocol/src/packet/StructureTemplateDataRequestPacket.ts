import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import {
    StructureTemplateRequestOperation,
    structureTemplateDataRequestPacket
} from '../wire/definitions/structureTemplateDataRequest';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { StructureTemplateDataRequestPayload } from '../wire/definitions/structureTemplateDataRequest';

export { StructureTemplateRequestOperation };

/** A request for a saved structure or its export data. */
export type StructureTemplateDataRequest = StructureTemplateDataRequestPayload;

/**
 * Requests data for a structure named in the structure block screen.
 *
 * Protocols 2193 and 2225 share this layout: `Structure Name` (string), `Structure Position`
 * (`BlockPos`), `Structure Settings`, then `Requested Operation` (uint8). Mojang documents this
 * feature as disabled server-side.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/structure-template-data-request-packet/
 */
export default class StructureTemplateDataRequestPacket extends NetworkPacket<StructureTemplateDataRequest> {
    public get id(): number {
        return PacketIdentifier.STRUCTURE_TEMPLATE_DATA_REQUEST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: StructureTemplateDataRequest): void {
        layoutAt(structureTemplateDataRequestPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): StructureTemplateDataRequest {
        return layoutAt(structureTemplateDataRequestPacket, this.codecProtocol).decode(stream);
    }
}
