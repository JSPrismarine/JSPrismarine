/**
 * `UpdateEquipPacket`: the contents of a horse inventory, sent when a player opens one.
 *
 * Wire order at protocol 2193: `Container Id` and `Type` as one byte each, `Size` as a ZigZag
 * varint32, `Entity Unique Id` as a ZigZag varint64, then `Data`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-equip-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/**
 * `Data`: a network NBT compound holding the slots and the items each slot accepts, which is
 * how only a saddle fits the saddle slot. The docs type it `unknown` and it runs to the end of
 * the packet, so it travels as raw bytes. Nothing in this server builds one yet.
 */
const inventoryData = t.custom<Buffer>(
    'NetworkNbtRemaining',
    (s, v) => s.write(v),
    (s) => s.readRemaining()
);

/** The fields sent when a player opens a horse inventory. */
export const updateEquipPacket = definePacket('UpdateEquipPacket', {
    /** `Container Id`: the id of the opened window. */
    containerId: t.uint8,
    /** `Type`: the window's type, a horse inventory in every known case. */
    type: t.uint8,
    /** `Size`: how many slots the window shows. */
    size: t.varint32,
    /** `Entity Unique Id`: the actor whose equipment this is, usually the horse. */
    entityUniqueId: t.varint64,
    /** `Data`: the slots and their allowed items; see {@link inventoryData}. */
    data: inventoryData
});

/** Payload carried by `UpdateEquipPacket`. */
export type UpdateEquipPayload = PayloadOf<typeof updateEquipPacket>;
