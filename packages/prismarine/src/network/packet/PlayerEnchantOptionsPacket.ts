import { EnchantType } from '@jsprismarine/minecraft';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * An enchantment, as the Enchant Type uint8 of an `EnchantmentInstance` numbers it. Generated
 * from Mojang's 1.26.51 release documentation in `@jsprismarine/minecraft`.
 * @deprecated Import `EnchantType` from `@jsprismarine/minecraft` instead.
 */
export { EnchantType };

/** One enchantment and the level it would be applied at. */
export interface EnchantmentInstance {
    /** Enchant Type, a uint8. */
    enchantType: EnchantType;
    /** Enchant Level, a uint8 counting from one. */
    enchantLevel: number;
}

/**
 * The enchantments one option would put on the item, split by what activates them.
 *
 * The docs give the three lists as `array<array<EnchantmentInstance>>`. There is no count in
 * front of the outer array: exactly three lists are written, each with its own varuint32
 * count. Vanilla fills the first with armor enchantments and splits the rest between the
 * other two.
 */
export interface ItemEnchants {
    /** Slot, an int32 in little-endian byte order. Vanilla sends 0, 1 or 2. */
    slot: number;
    /** Enchantments that work while the item is worn. */
    equipActivatedEnchants: EnchantmentInstance[];
    /** Enchantments that work while the item is held. */
    heldActivatedEnchants: EnchantmentInstance[];
    /** Enchantments that work on the holder. */
    selfActivatedEnchants: EnchantmentInstance[];
}

/** One button of the enchantment table: its price, its result, and the id to request it by. */
export interface ItemEnchantOption {
    /** Cost, a uint8: the experience levels the option takes. */
    cost: number;
    /** Enchants: what the item would end up with. */
    enchants: ItemEnchants;
    /** Enchant Name, shown to the player in the Standard Galactic Alphabet. */
    enchantName: string;
    /** Enchant Net Id, the `RecipeNetId` the client sends back to pick this option. */
    enchantNetId: number;
}

/**
 * The three enchantment options offered for the item in an enchantment table.
 *
 * Bound to the client. The server sends it for every slot change of the table, empty while
 * the table holds nothing that can be enchanted. The client picks an option by sending its
 * Enchant Net Id back in an `ItemStackRequestPacket` craft recipe action.
 *
 * Wire order at protocol 2193: Options as a varuint32 count followed by that many
 * `ItemEnchantOption`, each of which is Cost (uint8), Enchants (Slot as an int32 in
 * little-endian byte order, then three enchantment lists, each a varuint32 count followed by
 * pairs of uint8 for Enchant Type and Enchant Level), Enchant Name (string), and Enchant Net
 * Id (varuint32).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-enchant-options-packet/
 */
export default class PlayerEnchantOptionsPacket extends DataPacket {
    /** Options: one entry per button of the table, empty to clear the table. */
    public options: ItemEnchantOption[] = [];

    /** Reads the option count and each option. */
    public decodePayload(): void {
        const count = this.readUnsignedVarInt();

        this.options = [];
        for (let index = 0; index < count; index++) {
            this.options.push({
                cost: this.readByte(),
                enchants: {
                    slot: this.readIntLE(),
                    equipActivatedEnchants: this.readEnchantList(),
                    heldActivatedEnchants: this.readEnchantList(),
                    selfActivatedEnchants: this.readEnchantList()
                },
                enchantName: NetworkUtil.readString(this),
                enchantNetId: this.readUnsignedVarInt()
            });
        }
    }

    /** Writes the option count and each option. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.options.length);

        for (const option of this.options) {
            this.writeByte(option.cost);
            this.writeIntLE(option.enchants.slot);
            this.writeEnchantList(option.enchants.equipActivatedEnchants);
            this.writeEnchantList(option.enchants.heldActivatedEnchants);
            this.writeEnchantList(option.enchants.selfActivatedEnchants);
            NetworkUtil.writeString(this, option.enchantName);
            this.writeUnsignedVarInt(option.enchantNetId);
        }
    }

    private readEnchantList(): EnchantmentInstance[] {
        const count = this.readUnsignedVarInt();

        const enchants: EnchantmentInstance[] = [];
        for (let index = 0; index < count; index++) {
            enchants.push({ enchantType: this.readByte(), enchantLevel: this.readByte() });
        }

        return enchants;
    }

    private writeEnchantList(enchants: EnchantmentInstance[]): void {
        this.writeUnsignedVarInt(enchants.length);

        for (const enchant of enchants) {
            this.writeByte(enchant.enchantType);
            this.writeByte(enchant.enchantLevel);
        }
    }
}
