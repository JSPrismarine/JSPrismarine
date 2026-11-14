import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { updateSoftEnumPacket } from '../wire/definitions/updateSoftEnum';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { UpdateSoftEnumPayload } from '../wire/definitions/updateSoftEnum';

import { SoftEnumUpdateType } from '../wire/definitions/updateSoftEnum';
export { SoftEnumUpdateType };

/** A command enum update sent to the client. */
export type UpdateSoftEnum = UpdateSoftEnumPayload;

/**
 * Updates a soft enum without retransmitting the complete command catalog. These mutable
 * enums commonly represent names and tags supplied by server content.
 *
 * Protocol 2193 layout: `Enum Name` as a string, `Values` as a varuint32 count followed by
 * that many strings, and `Update Type` as one uint8 enum value.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-soft-enum-packet/
 */
export default class UpdateSoftEnumPacket extends NetworkPacket<UpdateSoftEnum> {
    public get id(): number {
        return PacketIdentifier.UPDATE_SOFT_ENUM;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateSoftEnum): void {
        layoutAt(updateSoftEnumPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateSoftEnum {
        return layoutAt(updateSoftEnumPacket, this.codecProtocol).decode(stream);
    }
}
