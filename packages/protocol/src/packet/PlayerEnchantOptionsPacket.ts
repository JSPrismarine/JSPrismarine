import { EnchantType } from '@jsprismarine/minecraft';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** Numeric enchantment identifiers carried by `EnchantmentInstance`. */
export { EnchantType };

/** One enchantment and the level the table offers for it. */
export interface EnchantmentInstance {
    /** Enchant Type as a uint8. */
    enchantType: EnchantType;
    /** Enchant Level as a uint8. */
    enchantLevel: number;
}

/** The enchantments in one option, grouped by the equipment that activates them. */
export interface ItemEnchants {
    /** Slot index, encoded as a little-endian int32. */
    slot: number;
    /** Enchantments active while the item is equipped. */
    equipActivatedEnchants: EnchantmentInstance[];
    /** Enchantments active while the item is held. */
    heldActivatedEnchants: EnchantmentInstance[];
    /** Enchantments active on the holder. */
    selfActivatedEnchants: EnchantmentInstance[];
}

/** One enchantment table option offered to the player. */
export interface ItemEnchantOption {
    /** Experience levels the option costs, encoded as a uint8. */
    cost: number;
    /** Enchantments the item receives if this option is selected. */
    enchants: ItemEnchants;
    /** Name shown in the Standard Galactic Alphabet. */
    enchantName: string;
    /** RecipeNetId returned when the client selects this option. */
    enchantNetId: number;
}

/** The options currently shown by the player's enchantment table. */
export interface PlayerEnchantOptions {
    /** The option list; empty clears the table. */
    options: ItemEnchantOption[];
}

/**
 * Sends the enchantment options the client shows for an open enchantment table.
 *
 * Protocol 2193 layout: `Options` is a varuint32 count followed by each option's uint8 cost,
 * `Enchants`, `Enchant Name`, and varuint32 `Enchant Net Id`. `Enchants` starts with `Slot` as
 * a little-endian int32, then three separate enchantment arrays: equipment-activated,
 * held-activated, and self-activated. Each array is a varuint32 count followed by uint8 type
 * and level pairs. The reference describes the nested arrays but does not assign names to the
 * three groups; their meanings follow the server's captured payloads.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-enchant-options-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/item-enchants/
 */
export default class PlayerEnchantOptionsPacket extends NetworkPacket<PlayerEnchantOptions> {
    public get id(): number {
        return PacketIdentifier.PLAYER_ENCHANT_OPTIONS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerEnchantOptions): void {
        stream.writeUnsignedVarInt(data.options.length);

        for (const option of data.options) {
            stream.writeByte(option.cost);
            stream.writeIntLE(option.enchants.slot);
            this.writeEnchantList(stream, option.enchants.equipActivatedEnchants);
            this.writeEnchantList(stream, option.enchants.heldActivatedEnchants);
            this.writeEnchantList(stream, option.enchants.selfActivatedEnchants);
            stream.writeString(option.enchantName);
            stream.writeUnsignedVarInt(option.enchantNetId);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerEnchantOptions {
        const count = stream.readUnsignedVarInt();
        const options: ItemEnchantOption[] = [];

        for (let index = 0; index < count; index++) {
            options.push({
                cost: stream.readByte(),
                enchants: {
                    slot: stream.readIntLE(),
                    equipActivatedEnchants: this.readEnchantList(stream),
                    heldActivatedEnchants: this.readEnchantList(stream),
                    selfActivatedEnchants: this.readEnchantList(stream)
                },
                enchantName: stream.readString(),
                enchantNetId: stream.readUnsignedVarInt()
            });
        }

        return { options };
    }

    private readEnchantList(stream: NetworkBinaryStream): EnchantmentInstance[] {
        const count = stream.readUnsignedVarInt();
        const enchants: EnchantmentInstance[] = [];

        for (let index = 0; index < count; index++) {
            enchants.push({ enchantType: stream.readByte(), enchantLevel: stream.readByte() });
        }

        return enchants;
    }

    private writeEnchantList(stream: NetworkBinaryStream, enchants: readonly EnchantmentInstance[]): void {
        stream.writeUnsignedVarInt(enchants.length);

        for (const enchant of enchants) {
            stream.writeByte(enchant.enchantType);
            stream.writeByte(enchant.enchantLevel);
        }
    }
}
