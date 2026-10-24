import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ChangeMobPropertyPacket`, in wire order. */
export interface ChangeMobProperty {
    /** `Actor Id`, the unique id of the mob whose property changes. */
    actorUniqueId: bigint;
    /** `Property Name`, the data-driven property identifier, for example `minecraft:climate`. */
    propertyName: string;
    /** `BoolComponent Value`, read when the property is a bool property. */
    boolValue: boolean;
    /** `StringComponent Value`, read when the property is an enum property. */
    stringValue: string;
    /** `IntComponent Value`, read when the property is an int property. */
    intValue: number;
    /** `FloatComponent Value`, read when the property is a float property. */
    floatValue: number;
}

/**
 * Sets one data-driven property on a mob. Every value slot is on the wire whatever the
 * property's type; the receiver picks the slot that matches the property's definition.
 *
 * Protocol 2193 layout, in wire order: `Actor Id` as a ZigZag varint64, `Property Name` as a
 * string, `BoolComponent Value` as one byte, `StringComponent Value` as a string,
 * `IntComponent Value` as a ZigZag varint32, then `FloatComponent Value` as a little-endian
 * float. Strings are a varuint32 byte length followed by UTF-8.
 */
export default class ChangeMobPropertyPacket extends NetworkPacket<ChangeMobProperty> {
    public get id(): number {
        return PacketIdentifier.CHANGE_MOB_PROPERTY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ChangeMobProperty): void {
        stream.writeVarLong(data.actorUniqueId);
        stream.writeString(data.propertyName);
        stream.writeBoolean(data.boolValue);
        stream.writeString(data.stringValue);
        stream.writeVarInt(data.intValue);
        stream.writeFloatLE(data.floatValue);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ChangeMobProperty {
        return {
            actorUniqueId: stream.readVarLong(),
            propertyName: stream.readString(),
            boolValue: stream.readBoolean(),
            stringValue: stream.readString(),
            intValue: stream.readVarInt(),
            floatValue: stream.readFloatLE()
        };
    }
}
