/**
 * `MobArmorEquipmentPacket`: sends all five worn item slots for one entity.
 *
 * After the target runtime id, the packet carries head, torso, legs, feet, and body as five
 * `NetworkItemStackDescriptor` values. Empty slots are full air descriptors; omitting one
 * would shift every later slot for the client.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/mob-armor-equipment-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { itemStackDescriptor } from '../structureTypes';

import type { PayloadOf } from '../define';

/** The fields sent when one entity's armor is shown to a client. */
export const mobArmorEquipmentPacket = definePacket('MobArmorEquipmentPacket', {
    /** `Target Runtime ID`: runtime id of the entity wearing these items. */
    runtimeEntityId: t.varuint64,
    /** `Head`: head armor. */
    head: itemStackDescriptor,
    /** `Torso`: torso armor. */
    chest: itemStackDescriptor,
    /** `Legs`: leg armor. */
    legs: itemStackDescriptor,
    /** `Feet`: foot armor. */
    feet: itemStackDescriptor,
    /** `Body`: body armor, used by horses, llamas, and wolves. */
    body: itemStackDescriptor
});

/** Payload carried by `MobArmorEquipmentPacket`. */
export type MobArmorEquipmentPayload = PayloadOf<typeof mobArmorEquipmentPacket>;
