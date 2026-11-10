/**
 * `ChangeMobPropertyPacket`: Sets one data-driven property on a mob. Every value slot is on the
 * wire whatever the property's type; the receiver picks the slot that matches the property's
 * definition.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `ChangeMobPropertyPacket` field list. */
export const changeMobPropertyPacket = definePacket('ChangeMobPropertyPacket', {
    /** `Actor Id`, the unique id of the mob whose property changes. */
    actorUniqueId: t.varint64,
    /** `Property Name`, the data-driven property identifier, for example `minecraft:climate`. */
    propertyName: t.string,
    /** `BoolComponent Value`, read when the property is a bool property. */
    boolValue: t.bool,
    /** `StringComponent Value`, read when the property is an enum property. */
    stringValue: t.string,
    /** `IntComponent Value`, read when the property is an int property. */
    intValue: t.varint32,
    /** `FloatComponent Value`, read when the property is a float property. */
    floatValue: t.lf32
});

/** Sets one data-driven property on a mob. */
export type ChangeMobPropertyPayload = PayloadOf<typeof changeMobPropertyPacket>;
