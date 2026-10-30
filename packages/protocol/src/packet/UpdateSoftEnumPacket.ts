import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** What to do with the values in a soft enum update. */
export enum SoftEnumUpdateType {
    /** Add these values to the enum the client already has. */
    ADD,
    /** Remove these values from the enum. */
    REMOVE,
    /** Replace the enum's current values with these values. */
    REPLACE
}

/** A command enum update sent to the client. */
export interface UpdateSoftEnum {
    /** Name of the soft enum declared in `AvailableCommandsPacket`. */
    enumName: string;
    /** Values to add, remove, or use as the replacement set. */
    values: readonly string[];
    /** Operation applied to the named enum. */
    type: SoftEnumUpdateType;
}

/**
 * Updates a soft enum without retransmitting the complete command catalog. These mutable
 * enums commonly represent names and tags supplied by server content.
 *
 * Protocol 2193 layout: `Enum Name` as a string, `Values` as a varuint32 count followed by
 * that many strings, and `Update Type` as one uint8 enum value.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-soft-enum-packet/
 */
export default class UpdateSoftEnumPacket extends NetworkPacket<UpdateSoftEnum> {
    public get id(): number {
        return PacketIdentifier.UPDATE_SOFT_ENUM;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateSoftEnum): void {
        stream.writeString(data.enumName);
        stream.writeUnsignedVarInt(data.values.length);
        for (const value of data.values) stream.writeString(value);
        stream.writeByte(data.type);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateSoftEnum {
        const enumName = stream.readString();
        const count = stream.readUnsignedVarInt();
        const values: string[] = [];
        for (let index = 0; index < count; index++) values.push(stream.readString());
        const type = stream.readByte();

        switch (type) {
            case SoftEnumUpdateType.ADD:
            case SoftEnumUpdateType.REMOVE:
            case SoftEnumUpdateType.REPLACE:
                return { enumName, values, type };
            default:
                throw new Error(`Unknown soft enum update type ${type}`);
        }
    }
}
