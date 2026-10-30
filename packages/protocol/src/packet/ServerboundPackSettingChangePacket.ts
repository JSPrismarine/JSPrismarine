import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import UUID from '../wire/structures/UUID';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** A pack setting value in one of the alternatives the packet carries. */
export type PackSettingValue = number | boolean | string | string[];

/** Selectors for the `PackSettingValue` alternatives, in wire order. */
export enum PackSettingValueType {
    Float = 0,
    Bool = 1,
    String = 2,
    StringList = 3
}

/** Data sent when the player changes a setting in a resource pack. */
export interface ServerboundPackSettingChange {
    /** UUID of the pack whose setting changed. */
    packId: UUID;
    /** Name of the setting in the pack's settings screen. */
    packSettingName: string;
    /** New value, whose JavaScript type selects the wire alternative. */
    packSettingValue: PackSettingValue;
}

/**
 * Reports a changed resource pack setting. The server must match the value's type to one of
 * the packet's four tagged alternatives; unknown selector values are malformed packets.
 *
 * Protocol 2193 layout: `Pack Id` as an `mce::UUID`, `Pack Setting Name` as a string, then
 * `Pack Setting Value` as a varuint32 selector and a float, boolean, string, or string list.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/serverbound-pack-setting-change-packet/
 */
export default class ServerboundPackSettingChangePacket extends NetworkPacket<ServerboundPackSettingChange> {
    public get id(): number {
        return PacketIdentifier.SERVERBOUND_PACK_SETTING_CHANGE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundPackSettingChange): void {
        data.packId.networkSerialize(stream);
        stream.writeString(data.packSettingName);

        const value = data.packSettingValue;
        if (typeof value === 'number') {
            stream.writeUnsignedVarInt(PackSettingValueType.Float);
            stream.writeFloatLE(value);
        } else if (typeof value === 'boolean') {
            stream.writeUnsignedVarInt(PackSettingValueType.Bool);
            stream.writeBoolean(value);
        } else if (typeof value === 'string') {
            stream.writeUnsignedVarInt(PackSettingValueType.String);
            stream.writeString(value);
        } else {
            stream.writeUnsignedVarInt(PackSettingValueType.StringList);
            stream.writeUnsignedVarInt(value.length);
            for (const entry of value) stream.writeString(entry);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundPackSettingChange {
        const packId = UUID.networkDeserialize(stream);
        const packSettingName = stream.readString();
        const selector = stream.readUnsignedVarInt();
        let packSettingValue: PackSettingValue;

        switch (selector) {
            case PackSettingValueType.Float:
                packSettingValue = stream.readFloatLE();
                break;
            case PackSettingValueType.Bool:
                packSettingValue = stream.readBoolean();
                break;
            case PackSettingValueType.String:
                packSettingValue = stream.readString();
                break;
            case PackSettingValueType.StringList: {
                const count = stream.readUnsignedVarInt();
                const values: string[] = [];
                for (let index = 0; index < count; index++) values.push(stream.readString());
                packSettingValue = values;
                break;
            }
            default:
                throw new Error(`Unknown pack setting value alternative ${selector}`);
        }

        return { packId, packSettingName, packSettingValue };
    }
}
