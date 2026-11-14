/**
 * `PlayerArmorDamagePacket`: durability taken off a player's armor, bound to the client.
 *
 * Wire order at protocol 2193: Armor Slot and Damage Pairs as a varuint32 count followed by
 * that many pairs of Armor Slot (ZigZag varint32) and Damage (int16 in little-endian byte
 * order). Older servers wrote a slot bitset followed by one ZigZag varint32 per set bit; the
 * 1.26.45 (protocol 2169) and 1.26.51 (protocol 2193) docs both give the counted list, and
 * gophertunnel at 2193 agrees.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-armor-damage-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { ArmorSlot } from '@jsprismarine/minecraft';
import type { PayloadOf } from '../define';

/** The `PlayerArmorDamagePacket` field list; the module doc carries the wire provenance. */
export const playerArmorDamagePacket = definePacket('PlayerArmorDamagePacket', {
    /** `Armor Slot and Damage Pairs`: one entry per piece that took damage. */
    armorSlotAndDamagePairs: t.list(
        t.record({
            /** `Armor Slot`, a ZigZag varint32. */
            armorSlot: t.enumOf<ArmorSlot>(t.varint32),
            /** `Damage`, an int16 in little-endian byte order, added to the durability already used. */
            damage: t.li16
        })
    )
});

/** Durability taken off a player's armor, as the packet carries it. */
export type PlayerArmorDamagePayload = PayloadOf<typeof playerArmorDamagePacket>;
