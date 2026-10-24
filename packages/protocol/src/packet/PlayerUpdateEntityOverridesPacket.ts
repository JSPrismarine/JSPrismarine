import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * Which alternative of the `Update` variant a `PlayerUpdateEntityOverridesPacket` carries. The
 * value is the alternative's index in the schema's `oneOf`, written as the varuint32 selector,
 * and matches the docs' `UpdateType` order.
 */
export enum EntityOverrideUpdateType {
    /** `ClearOverride`: drop every override the client holds for the entity. */
    ClearOverrides = 0,
    /** `RemoveOverride`: drop the override of the one property `Property Index` names. */
    RemoveOverride = 1,
    /** `IntOverride`: set an integer override for the property. */
    SetIntOverride = 2,
    /** `FloatOverride`: set a float override for the property. */
    SetFloatOverride = 3
}

/**
 * The `Type` string each alternative writes after the selector, indexed by
 * {@link EntityOverrideUpdateType}. The docs spell them in camel case (`ClearOverrides`);
 * gophertunnel and Cloudburst write these lower case forms at protocol 2193, and the
 * decoder discards the string either way.
 */
const UPDATE_TYPE_NAMES = ['clearoverrides', 'removeoverride', 'setintoverride', 'setfloatoverride'];

/** The `Update` variant of a `PlayerUpdateEntityOverridesPacket`. `type` picks the alternative and its fields. */
export type EntityOverrideUpdate =
    | { type: EntityOverrideUpdateType.ClearOverrides }
    | { type: EntityOverrideUpdateType.RemoveOverride }
    | {
          type: EntityOverrideUpdateType.SetIntOverride;
          /** `Value`, a little-endian int32. */
          value: number;
      }
    | {
          type: EntityOverrideUpdateType.SetFloatOverride;
          /** `Value`, a little-endian float. The client expects a finite number. */
          value: number;
      };

/** The fields of a `PlayerUpdateEntityOverridesPacket`, in wire order. */
export interface PlayerUpdateEntityOverrides {
    /** `Target ID`, the `ActorUniqueID` of the entity whose overrides change. */
    targetId: bigint;
    /** `Property Index` of the entity property the override applies to. Ignored by `ClearOverrides`. */
    propertyIndex: number;
    /** `Update`, the one alternative this packet carries. */
    update: EntityOverrideUpdate;
}

/**
 * Overrides one entity property on one client, removes that override, or clears every
 * override the client holds for the entity.
 *
 * Protocol 2193 layout, in wire order: `Target ID` as a ZigZag varint64, `Property Index` as
 * a varuint32, then `Update` as a Cereal tagged variant: a varuint32 selector (the
 * {@link EntityOverrideUpdateType} value), the alternative's `Type` string (a varuint32 byte
 * length then UTF-8), and for `IntOverride` a little-endian int32 `Value` or for
 * `FloatOverride` a little-endian float `Value`. `ClearOverride` and `RemoveOverride` end
 * after the string.
 *
 * Mojang's notes for 2193 say the packet moved to Cereal and its wire format is not
 * compatible with earlier protocols: the value is now part of the alternative's schema
 * instead of a conditional after a one byte type.
 */
export default class PlayerUpdateEntityOverridesPacket extends NetworkPacket<PlayerUpdateEntityOverrides> {
    public get id(): number {
        return PacketIdentifier.PLAYER_UPDATE_ENTITY_OVERRIDES;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerUpdateEntityOverrides): void {
        stream.writeVarLong(data.targetId);
        stream.writeUnsignedVarInt(data.propertyIndex);

        const { update } = data;
        const name = UPDATE_TYPE_NAMES[update.type];
        if (name === undefined) throw new Error(`Unknown entity override update type ${update.type}`);

        stream.writeUnsignedVarInt(update.type);
        stream.writeString(name);

        switch (update.type) {
            case EntityOverrideUpdateType.SetIntOverride:
                stream.writeIntLE(update.value);
                break;
            case EntityOverrideUpdateType.SetFloatOverride:
                stream.writeFloatLE(update.value);
                break;
            default:
                break;
        }
    }

    /**
     * Reads the payload. The `Type` string is read and discarded; the selector alone decides
     * the alternative.
     * @throws when the selector names none of the four alternatives.
     */
    protected deserializePayload(stream: NetworkBinaryStream): PlayerUpdateEntityOverrides {
        const targetId = stream.readVarLong();
        const propertyIndex = stream.readUnsignedVarInt();
        const type = stream.readUnsignedVarInt();
        if (type >= UPDATE_TYPE_NAMES.length) throw new Error(`Unknown entity override update type ${type}`);
        stream.readString();

        switch (type) {
            case EntityOverrideUpdateType.SetIntOverride:
                return { targetId, propertyIndex, update: { type, value: stream.readIntLE() } };
            case EntityOverrideUpdateType.SetFloatOverride:
                return { targetId, propertyIndex, update: { type, value: stream.readFloatLE() } };
            case EntityOverrideUpdateType.ClearOverrides:
            case EntityOverrideUpdateType.RemoveOverride:
                return { targetId, propertyIndex, update: { type } };
            default:
                throw new Error(`Unknown entity override update type ${type}`);
        }
    }
}
