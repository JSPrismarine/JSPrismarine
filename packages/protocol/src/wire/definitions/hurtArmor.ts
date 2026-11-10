/**
 * `HurtArmorPacket`: Tells a client how much damage its armor took, and leaves the client to apply
 * it.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/hurt-armor-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `HurtArmorPacket` field list. */
export const hurtArmorPacket = definePacket('HurtArmorPacket', {
    /**
     * Cause, the damage cause that produced the hit, as a `SharedTypes::Legacy::ActorDamageCause`
     * number. Mojang's datagen snapshot numbers its 35 members consecutively from `Override` (0)
     * to `MaceSmash` (34); this repository does not generate the enum.
     */
    cause: t.varint32,
    /** Damage, in damage points dealt to the wearer. The client derives the durability loss. */
    damage: t.varint32,
    /** Armor Slots, a bitset whose set bits are the slots to damage. */
    armorSlots: t.varuint64
});

/** Tells a client how much damage its armor took, and leaves the client to apply it. */
export type HurtArmorPayload = PayloadOf<typeof hurtArmorPacket>;
