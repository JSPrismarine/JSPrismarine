/**
 * `PlayerUpdateEntityOverridesPacket`: overrides one entity property on one client, removes
 * that override, or clears every override the client holds for the entity.
 *
 * Protocol 2193 layout, in wire order: `Target ID` as a ZigZag varint64, `Property Index` as a
 * varuint32, then `Update` as a Cereal tagged variant. Mojang's notes for 2193 say the packet
 * moved to Cereal and its wire format is not compatible with earlier protocols: the value is
 * now part of the alternative's schema instead of a conditional after a one byte type.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

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

/**
 * `Update`: a varuint32 selector, the alternative's `Type` string, then its value for
 * `IntOverride` and `FloatOverride`. The value depends on the selector, so the vocabulary
 * cannot describe it. The `Type` string is discarded on read; the selector alone decides the
 * alternative.
 */
const entityOverrideUpdate = t.custom<EntityOverrideUpdate>(
    'EntityOverrideUpdate',
    (s, update) => {
        const name = UPDATE_TYPE_NAMES[update.type];
        if (name === undefined) throw new Error(`Unknown entity override update type ${update.type}`);

        t.varuint32.write(s, update.type);
        t.string.write(s, name);

        switch (update.type) {
            case EntityOverrideUpdateType.SetIntOverride:
                t.li32.write(s, update.value);
                break;
            case EntityOverrideUpdateType.SetFloatOverride:
                t.lf32.write(s, update.value);
                break;
            default:
                break;
        }
    },
    (s) => {
        const type = t.varuint32.read(s);
        if (type >= UPDATE_TYPE_NAMES.length) throw new Error(`Unknown entity override update type ${type}`);
        t.string.read(s);

        switch (type) {
            case EntityOverrideUpdateType.SetIntOverride:
                return { type, value: t.li32.read(s) };
            case EntityOverrideUpdateType.SetFloatOverride:
                return { type, value: t.lf32.read(s) };
            case EntityOverrideUpdateType.ClearOverrides:
            case EntityOverrideUpdateType.RemoveOverride:
                return { type };
            default:
                throw new Error(`Unknown entity override update type ${type}`);
        }
    }
);

/** The fields of a `PlayerUpdateEntityOverridesPacket`, in wire order. */
export const playerUpdateEntityOverridesPacket = definePacket('PlayerUpdateEntityOverridesPacket', {
    /** `Target ID`, the `ActorUniqueID` of the entity whose overrides change, as a ZigZag varint64. */
    targetId: t.varint64,
    /** `Property Index` of the entity property the override applies to. Ignored by `ClearOverrides`. */
    propertyIndex: t.varuint32,
    /** `Update`, the one alternative this packet carries. */
    update: entityOverrideUpdate
});

/** The fields of a `PlayerUpdateEntityOverridesPacket`, in wire order. */
export type PlayerUpdateEntityOverrides = PayloadOf<typeof playerUpdateEntityOverridesPacket>;
