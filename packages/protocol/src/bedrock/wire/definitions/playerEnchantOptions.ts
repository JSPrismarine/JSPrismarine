/**
 * `PlayerEnchantOptionsPacket`: the enchantment options an open enchantment table offers.
 *
 * The payload is a varuint32 count of options. Each option is a uint8 cost, its `Enchants`
 * (a little-endian int32 slot, then three enchantment arrays), the enchant name, and a
 * varuint32 net id. An enchantment array is a varuint32 count of uint8 type and level pairs.
 * The reference prints the three arrays as one `array<array<EnchantmentInstance>>` and does not
 * name them; the three-array shape and the names follow other Bedrock implementations, and no
 * capture covers this packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-enchant-options-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/types/item-enchants/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { EnchantType } from '@jsprismarine/minecraft';
import type { PayloadOf } from '../../../wire/define';

/** `EnchantmentInstance`: one enchantment and the level the table offers for it. */
const enchantmentInstance = t.record({
    /** `Enchant Type`: the enchantment's numeric id, as a uint8. */
    enchantType: t.enumOf<EnchantType>(t.uint8),
    /** `Enchant Level`: the offered level, as a uint8. */
    enchantLevel: t.uint8
});

/** `ItemEnchants`: the enchantments in one option, grouped by what activates them. */
const itemEnchants = t.record({
    /** `Slot`: the slot index, as a little-endian int32. */
    slot: t.li32,
    /** `Equip Activated Enchants`: enchantments active while the item is equipped. */
    equipActivatedEnchants: t.list(enchantmentInstance),
    /** `Held Activated Enchants`: enchantments active while the item is held. */
    heldActivatedEnchants: t.list(enchantmentInstance),
    /** `Self Activated Enchants`: enchantments active on the holder. */
    selfActivatedEnchants: t.list(enchantmentInstance)
});

/** `ItemEnchantOption`: one enchantment table option offered to the player. */
const itemEnchantOption = t.record({
    /** `Cost`: the experience levels the option costs, as a uint8. */
    cost: t.uint8,
    /** `Enchants`: the enchantments the item receives if this option is selected. */
    enchants: itemEnchants,
    /** `Enchant Name`: the name shown in the Standard Galactic Alphabet. */
    enchantName: t.string,
    /** `Enchant Net Id`: the RecipeNetId the client returns when it selects this option. */
    enchantNetId: t.varuint32
});

/** The fields sent to show an enchantment table's options. */
export const playerEnchantOptionsPacket = definePacket('PlayerEnchantOptionsPacket', {
    /** `Options`: the option list; empty clears the table. */
    options: t.list(itemEnchantOption)
});

/** Payload carried by `PlayerEnchantOptionsPacket`. */
export type PlayerEnchantOptionsPayload = PayloadOf<typeof playerEnchantOptionsPacket>;
