import { EnchantType } from '@jsprismarine/minecraft';
import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { playerEnchantOptionsPacket } from '../wire/definitions/playerEnchantOptions';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { PlayerEnchantOptionsPayload } from '../wire/definitions/playerEnchantOptions';

/** Numeric enchantment identifiers carried by `EnchantmentInstance`. */
export { EnchantType };

/** The options currently shown by the player's enchantment table. */
export type PlayerEnchantOptions = PlayerEnchantOptionsPayload;

/** One enchantment table option offered to the player. */
export type ItemEnchantOption = PlayerEnchantOptions['options'][number];

/** The enchantments in one option, grouped by the equipment that activates them. */
export type ItemEnchants = ItemEnchantOption['enchants'];

/** One enchantment and the level the table offers for it. */
export type EnchantmentInstance = ItemEnchants['equipActivatedEnchants'][number];

/**
 * Sends the enchantment options the client shows for an open enchantment table.
 *
 * Protocol 2193 layout: `Options` is a varuint32 count followed by each option's uint8 cost,
 * `Enchants`, `Enchant Name`, and varuint32 `Enchant Net Id`. `Enchants` starts with `Slot` as
 * a little-endian int32, then three separate enchantment arrays: equipment-activated,
 * held-activated, and self-activated, with no count in front of the three. Each array is a
 * varuint32 count followed by uint8 type and level pairs. The reference prints this as
 * `array<array<EnchantmentInstance>>` and does not name the three groups; the three-array shape
 * and the names follow other Bedrock implementations, and no capture covers this packet at
 * protocol 2193 or 2225. The layout is the same at both versions.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-enchant-options-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/types/item-enchants/
 */
export default class PlayerEnchantOptionsPacket extends NetworkPacket<PlayerEnchantOptions> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'PlayerEnchantOptionsPacket';
    }

    public get id(): number {
        return PacketIdentifier.PLAYER_ENCHANT_OPTIONS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerEnchantOptions): void {
        layoutAt(playerEnchantOptionsPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerEnchantOptions {
        return layoutAt(playerEnchantOptionsPacket, this.codecProtocol).decode(stream);
    }
}
